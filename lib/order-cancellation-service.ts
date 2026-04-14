import { prisma } from "./prisma"
import { NotificationBridge } from "./notification-bridge"
import { getGlobalSocketServer } from "./socket-server"

interface CancelOrderParams {
  orderId: string
  userId: string
  reason?: string
  explanation?: string
}

interface CancelOrderResult {
  success: boolean
  order?: any
  courierBooking?: any
  payments?: any[]
  error?: string
}

/**
 * Service for canceling orders and handling refunds
 * This is a reusable service that can be used across different modules
 */
export async function cancelOrder(
  params: CancelOrderParams
): Promise<CancelOrderResult> {
  try {
    const { orderId, userId, reason, explanation } = params

    // Step 1: Fetch order with related data
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        customerId: userId,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        vendor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!order) {
      return {
        success: false,
        error: "Order not found or unauthorized",
      }
    }

    // Step 2: Check if order can be cancelled
    const nonCancellableStatuses = ["DELIVERED", "CANCELLED", "REFUNDED"]
    if (nonCancellableStatuses.includes(order.status)) {
      return {
        success: false,
        error: `Order cannot be cancelled. Current status: ${order.status}`,
      }
    }

    // Step 3: Find associated courier booking
    const courierBooking = await prisma.courierBooking.findFirst({
      where: {
        orderId: orderId,
      },
      include: {
        rider: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Step 4: Find all payments for this order
    const payments = await prisma.payment.findMany({
      where: {
        orderId: orderId,
        status: { in: ["PAID", "PENDING"] },
      },
    })

    // Step 5: Cancel order and courier booking in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Cancel order
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          notes: reason || explanation ? `${reason || ""} ${explanation || ""}`.trim() : order.notes,
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      // Cancel courier booking if exists
      let updatedCourierBooking = null
      if (courierBooking && courierBooking.status !== "CANCELLED" && courierBooking.status !== "COMPLETED") {
        updatedCourierBooking = await tx.courierBooking.update({
          where: { id: courierBooking.id },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
          },
        })
      }

      // Step 6: Mark payments as refundable/refunded
      const updatedPayments = []
      for (const payment of payments) {
        if (payment.status === "PAID") {
          // Mark as REFUNDED (or you could create a separate REFUNDABLE status)
          // For now, we'll mark as REFUNDED to indicate it should be refunded
          const updatedPayment = await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: "REFUNDED",
              metadata: {
                ...(payment.metadata as any || {}),
                refundReason: reason || "Order cancelled",
                refundExplanation: explanation || "",
                refundedAt: new Date().toISOString(),
                orderCancelled: true,
              },
            },
          })
          updatedPayments.push(updatedPayment)
        } else if (payment.status === "PENDING") {
          // Mark pending payments as FAILED
          const updatedPayment = await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: "FAILED",
              metadata: {
                ...(payment.metadata as any || {}),
                cancellationReason: reason || "Order cancelled",
                cancelledAt: new Date().toISOString(),
              },
            },
          })
          updatedPayments.push(updatedPayment)
        }
      }

      // Step 7: Add order tracking entry
      await tx.orderTracking.create({
        data: {
          orderId: orderId,
          status: "CANCELLED",
          notes: reason || explanation ? `Order cancelled: ${reason || explanation}` : "Order cancelled by customer",
          timestamp: new Date(),
        },
      })

      return {
        order: updatedOrder,
        courierBooking: updatedCourierBooking,
        payments: updatedPayments,
      }
    })

    // Step 8: Send notifications
    try {
      // Notify customer
      await NotificationBridge.sendNotification({
        userId: userId,
        title: "Order Cancelled",
        message: `Your order #${order.orderNumber} has been cancelled.${payments.length > 0 ? " Refund will be processed." : ""}`,
        type: "ORDER_UPDATE",
        module: order.module,
        data: {
          actionType: "navigate",
          screen: "OrderDetails",
          params: [{ name: "orderId", value: orderId }],
        },
        actionUrl: `/orders/${orderId}`,
      })

      // Notify vendor if exists
      if (order.vendorId) {
        await NotificationBridge.sendNotification({
          userId: order.vendorId,
          title: "Order Cancelled",
          message: `Order #${order.orderNumber} has been cancelled by the customer.`,
          type: "ORDER_UPDATE",
          module: order.module,
          data: {
            actionType: "navigate",
            screen: "OrderDetails",
            params: [{ name: "orderId", value: orderId }],
          },
          actionUrl: `/vendor/orders/${orderId}`,
        })
      }

      // Notify rider if courier booking exists and has rider
      if (result.courierBooking?.riderId) {
        await NotificationBridge.sendNotification({
          userId: result.courierBooking.riderId,
          title: "Delivery Cancelled",
          message: `Order #${order.orderNumber} has been cancelled.`,
          type: "ORDER_UPDATE",
          module: "COURIER",
          data: {
            actionType: "navigate",
            screen: "AvailableRides",
          },
        })
      }

      // Send WebSocket notifications
      const socketServer = getGlobalSocketServer()
      if (socketServer) {
        // Notify customer
        await socketServer.sendNotificationToUser(userId, {
          type: "order_cancelled",
          orderId: orderId,
          orderNumber: order.orderNumber,
          message: "Your order has been cancelled",
          timestamp: new Date().toISOString(),
        })

        // Notify vendor
        if (order.vendorId) {
          await socketServer.sendNotificationToUser(order.vendorId, {
            type: "order_cancelled",
            orderId: orderId,
            orderNumber: order.orderNumber,
            message: "Order cancelled by customer",
            timestamp: new Date().toISOString(),
          })
        }

        // Notify rider
        if (result.courierBooking?.riderId) {
          await socketServer.sendNotificationToUser(result.courierBooking.riderId, {
            type: "booking_cancelled",
            bookingId: result.courierBooking.id,
            orderId: orderId,
            message: "Order cancelled by customer",
            timestamp: new Date().toISOString(),
          })
        }
      }
    } catch (notifError) {
      console.error("Error sending notifications:", notifError)
      // Don't fail cancellation if notifications fail
    }

    return {
      success: true,
      order: result.order,
      courierBooking: result.courierBooking,
      payments: result.payments,
    }
  } catch (error) {
    console.error("Error cancelling order:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to cancel order",
    }
  }
}
