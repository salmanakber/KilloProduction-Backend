import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import type { Prisma } from "@prisma/client"

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

    return NextResponse.json({ order: orderPayload })
  } catch (error) {
    console.error("Order fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 })
  }
}
