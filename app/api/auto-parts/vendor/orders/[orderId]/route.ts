import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import {
  settlementMerchandiseFromOrderItems,
  summarizeOfferFundingFromItems,
  usesOfferSettlementModule,
  type OfferDiscountFundingSummary,
} from "@/lib/pharmacy-vendor-settlement"

export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || (user.role !== "VENDOR" && user.role !== "CUSTOMER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    

    const { orderId } = params

    const where: any = {
      id: orderId,
      module: "AUTO_PARTS",
    };
    
    if (user.role === "VENDOR") {
      where.vendorId = user.id
    } else if (user.role === "CUSTOMER") {
      where.customerId = user.id
      where.status = { not: "DRAFT" }
    }

    const order = await prisma.order.findFirst({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatar: true,
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
          orderBy: { timestamp: "desc" },
        },
      },
    });
    
    console.log('order', order)

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const orderMeta = (order as { metadata?: { specialOffers?: unknown } | null }).metadata
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

    return NextResponse.json({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        subtotal: order.subtotal,
        vendorId: order.vendorId,
        vendorCommission: order.vendorCommission,
        deliveryFee: order.deliveryFee,
        serviceFee: order.serviceFee,
        tax: order.tax,
        discount: order.discount,
        total: order.total,
        deliveryType: order.deliveryType,
        estimatedDelivery: order.estimatedDelivery,
        actualDelivery: order.actualDelivery,
        trackingNumber: order.trackingNumber,
        notes: order.notes,
        specialInstructions: order.specialInstructions,
        confirmedAt: order.confirmedAt,
        preparedAt: order.preparedAt,
        pickedUpAt: order.pickedUpAt,
        deliveredAt: order.deliveredAt,
        cancelledAt: order.cancelledAt,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        customer: order.customer,
        address: order.address,
        items: order.orderItems,
        tracking: order.orderTracking,
        metadata: (order as any).metadata || {},
        isChildOrder: order.isChildOrder,
        childId: order.childId,
        customerMerchandiseSubtotal: subNum,
        vendorSettlementMerchandise,
        specialOfferDiscountFunding,
        specialOffers: orderMeta?.specialOffers ?? null,
      },
    })
  } catch (error) {
    console.error("Order fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 })
  }
}

