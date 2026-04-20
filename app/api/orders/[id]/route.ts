import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import type { Prisma } from "@prisma/client"
import {
  settlementMerchandiseFromOrderItems,
  summarizeOfferFundingFromItems,
  usesOfferSettlementModule,
  type OfferDiscountFundingSummary,
} from "@/lib/pharmacy-vendor-settlement"

const orderDetailInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      avatar: true,
    },
  },
  vendor: {
    select: {
      id: true,
      name: true,
      phone: true,
    },
  },
  rider: {
    select: {
      id: true,
      name: true,
      phone: true,
    },
  },
  orderItems: {
    select: {
      id: true,
      productId: true,
      productType: true,
      productName: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      notes: true,
      customizations: true,
    },
  },
  address: {
    select: {
      id: true,
      title: true,
      street: true,
      city: true,
      state: true,
      country: true,
      postalCode: true,
      latitude: true,
      longitude: true,
      instructions: true,
    },
  },
  orderTracking: {
    orderBy: { timestamp: "desc" as const },
  },
  food: {
    select: {
      id: true,
      name: true,
      logo: true,
      coverImage: true,
    },
  },
  grocery: {
    select: {
      id: true,
      storeName: true,
      logo: true,
      coverImage: true,
    },
  },
  pharmacy: {
    select: {
      id: true,
      pharmacyName: true,
      userId: true,
      logo: true,
      phone: true,
      address: true,
    },
  },
} satisfies Prisma.OrderInclude

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: orderId } = params

    const pharmacyForVendor =
      user.role === "VENDOR"
        ? await prisma.pharmacy.findFirst({
            where: { userId: user.id },
            select: { id: true },
          })
        : null

    const vendorOrderOr: Prisma.OrderWhereInput[] = [
      { vendorId: user.id },
      ...(pharmacyForVendor
        ? [{ module: "PHARMACY" as const, pharmacyId: pharmacyForVendor.id }]
        : []),
    ]

    const where: Prisma.OrderWhereInput = {
      id: orderId,
    }

    // Filter by user role
    if (user.role === "CUSTOMER") {
      where.customerId = user.id
      where.status = { not: "DRAFT" }
    } else if (user.role === "VENDOR") {
      where.OR = vendorOrderOr
    } else if (user.role === "RIDER") {
      where.riderId = user.id
    } else if (user.role === "MECHANIC") {
      where.AND = [
        { module: "AUTO_PARTS" },
        {
          OR: [
            {
              metadata: {
                path: ["mechanicId"],
                equals: user.id,
              },
            },
            {
              parentOrder: {
                is: {
                  module: "AUTO_PARTS",
                  metadata: {
                    path: ["mechanicId"],
                    equals: user.id,
                  },
                },
              },
            },
          ],
        },
      ]
    }

    let order = await prisma.order.findFirst({
      where,
      include: orderDetailInclude,
    })

    // Vendor opened parent aggregate id (multi-store): return this vendor's child order instead
    if (!order && user.role === "VENDOR") {
      const parent = await prisma.order.findFirst({
        where: {
          id: orderId,
          childOrders: { some: {} },
        },
        select: { id: true },
      })
      if (parent) {
        order = await prisma.order.findFirst({
          where: {
            childId: parent.id,
            OR: vendorOrderOr,
          },
          include: orderDetailInclude,
        })
      }
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // If vendor somehow loaded a parent aggregate, swap to their child (same customer cart)
    if (user.role === "VENDOR") {
      const childCount = await prisma.order.count({ where: { childId: order.id } })
      if (childCount > 0) {
        const childOrder = await prisma.order.findFirst({
          where: {
            childId: order.id,
            OR: vendorOrderOr,
          },
          include: orderDetailInclude,
        })
        if (childOrder) {
          order = childOrder
        } else {
          return NextResponse.json({ error: "Order not found" }, { status: 404 })
        }
      }
    }

    /** Courier booking is stored on the aggregate parent order, not on per-store child rows. */
    const courierLookupOrderId =
      order.isChildOrder && order.childId ? order.childId : order.id

    const courierBooking = await prisma.courierBooking.findFirst({
      where: { orderId: courierLookupOrderId },
      select: {
        id: true,
        bookingNumber: true,
        status: true,
        riderId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    })

    let orderPayload = { ...order }

    // For food orders, fetch images for menu items
    if (order.module === "FOOD" && order.orderItems?.length) {
      const menuItemIds = order.orderItems
        .filter((item: any) => item.productType === "MENU_ITEM" && item.productId)
        .map((item: any) => item.productId)

      if (menuItemIds.length > 0) {
        const menuItems = await prisma.menuItem.findMany({
          where: { id: { in: menuItemIds } },
          select: { id: true, images: true },
        })
        orderPayload = {
          ...orderPayload,
          orderItems: order.orderItems.map((item: any) => {
            if (item.productType === "MENU_ITEM" && item.productId) {
              const mi = menuItems.find((m: any) => m.id === item.productId)
              const images = mi?.images ? (Array.isArray(mi.images) ? mi.images : [mi.images]) : []
              return { ...item, productImage: item.productImage || images[0] || null, images }
            }
            return item
          }),
        }
      }
    }

    // For grocery orders, fetch images for grocery products
    if (order.module === "GROCERY" && order.orderItems?.length) {
      const productIds = order.orderItems
        .filter((item: any) => item.productType === "GROCERY_PRODUCT" && item.productId)
        .map((item: any) => item.productId)

      if (productIds.length > 0) {
        const products = await prisma.groceryProduct.findMany({
          where: { id: { in: productIds } },
          select: { id: true, images: true },
        })
        orderPayload = {
          ...orderPayload,
          orderItems: order.orderItems.map((item: any) => {
            if (item.productType === "GROCERY_PRODUCT" && item.productId) {
              const p = products.find((x: any) => x.id === item.productId)
              const images = p?.images ? (Array.isArray(p.images) ? p.images : [p.images]) : []
              return { ...item, productImage: item.productImage || images[0] || null, images }
            }
            return item
          }),
        }
      }
    }

    /** Card payment + ledger attach to the aggregate parent; child rows use `childId` → parent. */
    const ledgerOrderId =
      order.isChildOrder && order.childId ? order.childId : order.id

    const processingLedger = await prisma.paymentProcessingLedger.findFirst({
      where: { payment: { orderId: ledgerOrderId } },
      select: { commissionAmount: true, commissionRate: true },
    })

    const orderMeta = order.metadata as { specialOffers?: unknown } | null | undefined
    const subNum = Number(order.subtotal || 0)
    const discNum = Number(order.discount || 0)
    let vendorSettlementMerchandise = subNum
    let specialOfferDiscountFunding: OfferDiscountFundingSummary | undefined
    if (usesOfferSettlementModule(order.module)) {
      vendorSettlementMerchandise = settlementMerchandiseFromOrderItems(
        order.orderItems,
        subNum,
        discNum,
      )
      specialOfferDiscountFunding = summarizeOfferFundingFromItems(order.orderItems)
    }

    const orderWithDelivery = {
      ...orderPayload,
      courierBookingId: courierBooking?.id ?? null,
      courierBookingNumber: courierBooking?.bookingNumber ?? null,
      courierBookingStatus: courierBooking?.status ?? null,
      deliveryRiderAssigned: Boolean(courierBooking?.riderId),
      paymentProcessingFee: processingLedger?.commissionAmount ?? null,
      paymentProcessingRate: processingLedger?.commissionRate ?? null,
      /** Customer-paid merchandise (order subtotal before settlement view). */
      customerMerchandiseSubtotal: subNum,
      /** Book / settlement merchandise for offer-aware modules (matches vendor list `totalAmount`). */
      vendorSettlementMerchandise,
      specialOfferDiscountFunding,
      specialOffers: orderMeta?.specialOffers ?? null,
    }

    return NextResponse.json({ order: orderWithDelivery })
  } catch (error) {
    console.error("Order fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 })
  }
}
