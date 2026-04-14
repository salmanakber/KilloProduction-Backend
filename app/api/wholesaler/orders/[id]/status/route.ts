import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "WHOLESALER" as any) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    const body = await request.json()
    const { status } = body

    if (!status || !["PENDING", "CONFIRMED", "DELIVERED", "CANCELLED"].includes(status)) {
      return NextResponse.json(
        { error: "Valid status is required" },
        { status: 400 }
      )
    }

    // Get the order
    const order = await prisma.supplierOrder.findUnique({
      where: { 
        id: params.id,
        wholesalerId: wholesaler.id,
        isQuote: false, // Only actual orders, not quotes
      },
      include: {
        pharmacy: {
          select: {
            userId: true,
            pharmacyName: true,
          }
        }
      }
    })

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      )
    }

    // Update order status
    const updatedOrder = await prisma.supplierOrder.update({
      where: { id: params.id },
      data: { status },
      include: {
        pharmacy: {
          select: {
            userId: true,
            pharmacyName: true,
          }
        }
      }
    })

    // Send notification to pharmacy about status update
    const { NotificationBridge } = await import("@/lib/notification-bridge")
    
    let notificationMessage = ""
    switch (status) {
      case "CONFIRMED":
        notificationMessage = `Your order ${order.orderNumber} has been confirmed by ${wholesaler.companyName}`
        break
      case "DELIVERED":
        notificationMessage = `Your order ${order.orderNumber} has been delivered by ${wholesaler.companyName}`
        break
      case "CANCELLED":
        notificationMessage = `Your order ${order.orderNumber} has been cancelled by ${wholesaler.companyName}`
        break
      default:
        notificationMessage = `Your order ${order.orderNumber} status has been updated to ${status} by ${wholesaler.companyName}`
    }

    await NotificationBridge.sendNotification({
      userId: order.pharmacy.userId,
      title: "Order Status Update",
      message: notificationMessage,
      type: "ORDER_UPDATE",
      module: "PHARMACY",
      data: { 
        orderId: order.id,
        orderNumber: order.orderNumber,
        status,
        wholesalerName: wholesaler.companyName
      },
      actionUrl: `/pharmacy/orders/${order.id}`
    })

    return NextResponse.json({
      message: "Order status updated successfully",
      order: {
        id: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        status: updatedOrder.status,
      }
    })
  } catch (error) {
    console.error("Order status update error:", error)
    return NextResponse.json(
      { error: "Failed to update order status" },
      { status: 500 }
    )
  }
}

