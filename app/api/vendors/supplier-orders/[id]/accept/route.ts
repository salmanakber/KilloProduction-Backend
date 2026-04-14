import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { createPaymentIntent } from "@/lib/payment-gateway"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { paymentGateway, deliveryAddress } = body

    // Get the supplier order
    const supplierOrder = await prisma.supplierOrder.findUnique({
      where: { 
        id: params.id,
        pharmacy: { userId: user.id },
        isQuote: true,
        status: "QUOTE_ACCEPTED"
      },
      include: {
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true,
            phone: true
          }
        },
        wholesaler: {
          select: {
            id: true,
            companyName: true,
            phone: true,
            email: true
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unitPrice: true,
                stock: true
              }
            }
          }
        }
      }
    })

    if (!supplierOrder) {
      return NextResponse.json(
        { error: "Quote not found or not accepted" },
        { status: 404 }
      )
    }

    // Check if quote is still valid
    if (supplierOrder.quoteExpiryDate && new Date() > supplierOrder.quoteExpiryDate) {
      return NextResponse.json(
        { error: "Quote has expired" },
        { status: 400 }
      )
    }

    // Validate stock availability
    for (const item of supplierOrder.items) {
      if (item.product.stock < item.quantity) {
        return NextResponse.json(
          { error: `Insufficient stock for ${item.product.name}` },
          { status: 400 }
        )
      }
    }

    // Create payment intent
    let paymentIntent = null
    if (paymentGateway) {
      try {
        paymentIntent = await createPaymentIntent({
          amount: supplierOrder.totalAmount,
          currency: supplierOrder.currency,
          gateway: paymentGateway,
          orderId: supplierOrder.id,
          description: `Supplier order ${supplierOrder.orderNumber} to ${supplierOrder.wholesaler.companyName}`,
          customerEmail: user.email,
          customerPhone: supplierOrder.pharmacy.phone,
          metadata: {
            orderType: "SUPPLIER_ORDER",
            wholesalerId: supplierOrder.wholesalerId,
            pharmacyId: supplierOrder.pharmacyId,
            quoteNumber: supplierOrder.quoteNumber
          },
        })
      } catch (paymentError) {
        console.error("Payment intent creation failed:", paymentError)
        return NextResponse.json(
          { error: "Failed to create payment intent" },
          { status: 500 }
        )
      }
    }

    // Update order status
    const updatedOrder = await prisma.supplierOrder.update({
      where: { id: params.id },
      data: {
        status: "CONFIRMED",
        orderType: "CONFIRMED_ORDER",
        isQuote: false,
        pharmacyAcceptance: true,
        deliveryAddress: deliveryAddress || supplierOrder.deliveryAddress,
        paymentStatus: paymentIntent ? "PENDING" : "PENDING"
      }
    })

    // Send notification to supplier
    const { NotificationBridge } = await import("@/lib/notification-bridge")
    await NotificationBridge.sendNotification({
      userId: supplierOrder.wholesaler.userId,
      title: "Order Confirmed",
      message: `${supplierOrder.pharmacy.pharmacyName} has confirmed the order`,
      type: "ORDER_UPDATE",
      module: "WHOLESALER",
      data: { 
        orderId: supplierOrder.id,
        pharmacyName: supplierOrder.pharmacy.pharmacyName
      },
      actionUrl: `/wholesaler/orders/${supplierOrder.id}`
    })

    return NextResponse.json({
      message: "Order confirmed successfully",
      order: {
        id: updatedOrder.id,
        status: updatedOrder.status,
        orderType: updatedOrder.orderType,
        paymentStatus: updatedOrder.paymentStatus
      },
      paymentIntent
    })
  } catch (error) {
    console.error("Order acceptance error:", error)
    return NextResponse.json(
      { error: "Failed to accept order" },
      { status: 500 }
    )
  }
}
