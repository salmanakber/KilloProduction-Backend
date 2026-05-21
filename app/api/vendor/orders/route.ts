import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import {
  settlementMerchandiseFromOrderItems,
  summarizeOfferFundingFromItems,
  usesOfferSettlementModule,
} from "@/lib/pharmacy-vendor-settlement"

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const vendorId = user.id

    const pharmacyForVendor = await prisma.pharmacy.findFirst({
      where: { userId: vendorId },
      select: { id: true },
    })

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const skip = (page - 1) * limit

    // Vendor sees only their own line items: child rows (vendorId / pharmacyId).
    // Parent aggregate orders (multi-store) have childOrders — those are customer-facing only; exclude them.
    // Pharmacy children carry pharmacyId; do not match parent via multiplePickups (that pulled the full cart).
    const where: any = {
      AND: [
        {
          OR: [
            { vendorId },
            ...(pharmacyForVendor
              ? [{ module: "PHARMACY" as const, pharmacyId: pharmacyForVendor.id }]
              : []),
          ],
        },
        { NOT: { childOrders: { some: {} } } },
      ],
    }

    if (status && status !== "all") {
      where.status = status.toUpperCase()
    }

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
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
              customizations: true,
            },
          },
          address: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ])

    const orderIds = orders.map((o) => o.id)
    const courierRows =
      orderIds.length > 0
        ? await prisma.courierBooking.findMany({
            where: { orderId: { in: orderIds } },
            select: {
              id: true,
              orderId: true,
              riderId: true,
              status: true,
              bookingNumber: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : []

    const courierByOrderId = new Map<string, (typeof courierRows)[0]>()
    for (const row of courierRows) {
      if (row.orderId && !courierByOrderId.has(row.orderId)) {
        courierByOrderId.set(row.orderId, row)
      }
    }

    const paymentRows =
      orderIds.length > 0
        ? await prisma.payment.findMany({
            where: {
              OR: [
                { orderId: { in: orderIds } },
                ...orderIds.map((id) => ({
                  metadata: { path: ["parentOrderId"], equals: id },
                })),
              ],
            },
            select: {
              orderId: true,
              metadata: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : []
    const refundByOrderId = new Map<string, Record<string, any>>()
    for (const p of paymentRows) {
      if (!p.metadata || typeof p.metadata !== "object" || Array.isArray(p.metadata)) continue
      const m = p.metadata as Record<string, any>
      const refund = m.refund && typeof m.refund === "object" && !Array.isArray(m.refund) ? (m.refund as Record<string, any>) : null
      if (!refund) continue
      const targetOrderId = String(refund.sourceOrderId || p.orderId || m.parentOrderId || "")
      if (!targetOrderId || refundByOrderId.has(targetOrderId)) continue
      refundByOrderId.set(targetOrderId, refund)
    }

    // Format orders for frontend
    const formattedOrders = orders.map((order) => {
      const cb = courierByOrderId.get(order.id)
      const orderMeta = order.metadata as { specialOffers?: unknown } | null | undefined
      const customerMerchandiseSubtotal = order.subtotal
      let vendorMerchandiseTotal = customerMerchandiseSubtotal
      if (usesOfferSettlementModule(order.module)) {
        vendorMerchandiseTotal = settlementMerchandiseFromOrderItems(
          order.orderItems,
          Number(order.subtotal || 0),
          Number(order.discount || 0),
        )
      }
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        module: order.module,
        customer: {
          name: order.customer.name,
          phone: order.customer.phone,
          email: order.customer.email,
          address: order.address || "N/A",
        },
        items: order.orderItems.map((item) => ({
          id: item.id,
          productId: item.productId,
          productType: item.productType,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          customizations: item.customizations,
        })),
        status: order.status.toLowerCase(),
        /** Customer-paid merchandise (after line discounts); unchanged for reporting. */
        customerMerchandiseSubtotal,
        /** Marketplace modules with special offers: book-value merchandise (platform-funded uses list price); wallet settlement base before commission. */
        totalAmount: usesOfferSettlementModule(order.module) ? vendorMerchandiseTotal : order.subtotal,
        specialOfferDiscountFunding: usesOfferSettlementModule(order.module)
          ? summarizeOfferFundingFromItems(order.orderItems)
          : undefined,
        /** From `Order.metadata.specialOffers` at checkout (cart `specialOffer` + line customizations). */
        specialOffers: orderMeta?.specialOffers ?? null,
        courierBookingId: cb?.id ?? null,
        deliveryRiderAssigned: Boolean(cb?.riderId),
        createdAt: order.createdAt,
        estimatedDeliveryTime: order.estimatedDelivery ?? null,
        paymentStatus: order.paymentStatus.toLowerCase(),
        deliveryType: order.deliveryType?.toLowerCase() || "delivery",
        specialInstructions: order.specialInstructions,
        refundStatus: String(refundByOrderId.get(order.id)?.status || ""),
        refundMethod: String(refundByOrderId.get(order.id)?.refundMethod || ""),
        refundAmount: Number(refundByOrderId.get(order.id)?.requestedRefundAmount || 0),
        refundRequestedAt: String(refundByOrderId.get(order.id)?.requestedAt || ""),
        refundSettlementPendingPickupOtp: Boolean(refundByOrderId.get(order.id)?.settlementPendingPickupOtp),
      }
    })
    

    return NextResponse.json({
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching orders:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
