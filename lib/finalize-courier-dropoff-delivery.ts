import { prisma } from "@/lib/prisma"
import { runCourierCompletionSideEffects } from "@/lib/courier-post-completion"

/**
 * Completes courier booking at drop-off (same outcome as rider scanning customer QR in DELIVERY phase).
 * Idempotent if booking is already COMPLETED.
 */
export async function finalizeCourierDropoffDelivery(courierBookingId: string): Promise<{
  success: boolean
  alreadyCompleted?: boolean
  error?: string
}> {
  const fullBooking = await prisma.courierBooking.findUnique({
    where: { id: courierBookingId },
    select: { id: true, riderId: true, status: true, orderId: true },
  })

  if (!fullBooking || !fullBooking.orderId) {
    return { success: false, error: "Booking or order not found" }
  }

  if (fullBooking.status === "COMPLETED") {
    return { success: true, alreadyCompleted: true }
  }

  if (fullBooking.status !== "ARRIVED_AT_DROPOFF") {
    return { success: false, error: "Rider must arrive at dropoff before delivery can be confirmed" }
  }

  const linkedOrder = await prisma.order.findUnique({
    where: { id: fullBooking.orderId },
    select: {
      id: true,
      isChildOrder: true,
      childId: true,
    },
  })

  if (!linkedOrder) {
    return { success: false, error: "Order not found" }
  }

  const parentOrderId =
    linkedOrder.isChildOrder && linkedOrder.childId ? linkedOrder.childId : linkedOrder.id

  const parentRow = await prisma.order.findUnique({
    where: { id: parentOrderId },
    select: { partRequestId: true },
  })

  await prisma.courierBooking.update({
    where: { id: courierBookingId },
    data: { status: "COMPLETED", deliveredAt: new Date() },
  })

  const deliveredAt = new Date()

  await prisma.order.update({
    where: { id: parentOrderId },
    data: {
      status: "DELIVERED",
      paymentStatus: "PAID",
      deliveredAt,
      ...(parentRow?.partRequestId && {
        partRequest: { update: { status: "COMPLETED" } },
      }),
    },
  })

  await prisma.order.updateMany({
    where: {
      childId: parentOrderId,
      isChildOrder: true,
    },
    data: {
      status: "DELIVERED",
      paymentStatus: "PAID",
      deliveredAt,
    },
  })

  try {
    await prisma.orderTracking.create({
      data: {
        orderId: parentOrderId,
        status: "DELIVERED",
        notes: "Delivery confirmed (customer or rider)",
        timestamp: new Date(),
      },
    })
  } catch (e) {
    console.error("orderTracking:", e)
  }

  await runCourierCompletionSideEffects(courierBookingId)

  return { success: true }
}
