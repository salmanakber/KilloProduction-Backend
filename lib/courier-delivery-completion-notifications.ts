import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"
import { socketIOServer } from "@/lib/socket-server"
import { sendWholesaleCourierTripCompletedReviewPrompts } from "@/lib/wholesale-courier-completion-notifications"

/**
 * When a courier booking reaches COMPLETED/DELIVERED, notify customer, rider, and store vendors
 * to rate each other. Persists via NotificationBridge (DB + push + websocket fan-out).
 *
 * Call from any completion path: status PUT, QR verify, customer confirm-delivery, etc.
 * Wholesale (WHOLESALER) delegates to `sendWholesaleCourierTripCompletedReviewPrompts`.
 */
export async function notifyCourierDeliveryCompleted(
  courierBookingId: string,
  options?: { terminalStatus?: string }
): Promise<void> {
  const terminalStatus = String(options?.terminalStatus || "COMPLETED").toUpperCase()

  const updatedBooking = await prisma.courierBooking.findUnique({
    where: { id: courierBookingId },
    select: {
      id: true,
      module: true,
      bookingNumber: true,
      orderId: true,
      riderId: true,
      customer: { select: { id: true } },
    },
  })

  if (!updatedBooking?.customer?.id) return

  if (updatedBooking.module === "WHOLESALER") {
    await sendWholesaleCourierTripCompletedReviewPrompts({
      courierBookingId,
      bookingNumber: updatedBooking.bookingNumber,
      customerUserId: updatedBooking.customer.id,
      riderUserId: updatedBooking.riderId,
      terminalStatus,
    })
    return
  }

  let updatedOrder: { module?: string | null } | null = null
  if (updatedBooking.orderId) {
    updatedOrder = await prisma.order.findUnique({
      where: { id: updatedBooking.orderId },
      select: { module: true },
    })
  }

  const customerReviewParams = [
    { name: "bookingId", value: courierBookingId },
    {
      name: "serviceType",
      value: (updatedOrder?.module?.toLowerCase() || "courier") as string,
    },
  ]

  try {
    await NotificationBridge.sendNotification({
      userId: updatedBooking.customer.id,
      title: "Rate Your Delivery",
      message: "Your delivery is complete. Please rate your rider to help us improve.",
      type: "REVIEW_REQUEST",
      module: "COURIER",
      actionUrl: `/courier-bookings/${courierBookingId}/rate`,
      data: {
        actionType: "navigate",
        screen: "riderfeedback",
        courierBookingId,
        params: customerReviewParams,
      },
    })
  } catch (e) {
    console.error("notifyCourierDeliveryCompleted customer:", e)
  }

  try {
    await socketIOServer.sendNotificationToUser(updatedBooking.customer.id, {
      type: "review_request",
      bookingId: courierBookingId,
      bookingType: "courier",
      bookingNumber: updatedBooking.bookingNumber,
      actionType: "navigate",
      screen: "riderfeedback",
      params: [{ name: "bookingId", value: courierBookingId }],
      timestamp: new Date().toISOString(),
    })
  } catch (wsError) {
    console.error("notifyCourierDeliveryCompleted customer socket:", wsError)
  }

  if (updatedBooking.riderId) {
    try {
      const svc = (updatedOrder?.module?.toLowerCase() || "courier") as string
      await NotificationBridge.sendNotification({
        userId: updatedBooking.riderId,
        title: "Rate your customer",
        message: `Delivery #${updatedBooking.bookingNumber} is complete. Please rate your customer.`,
        type: "REVIEW_REQUEST",
        module: "RIDER",
        actionUrl: `/riderfeedback?bookingId=${courierBookingId}&perspective=rider`,
        data: {
          actionType: "navigate",
          screen: "riderfeedback",
          bookingId: courierBookingId,
          courierBookingId,
          perspective: "rider",
          params: [
            { name: "bookingId", value: courierBookingId },
            { name: "perspective", value: "rider" },
            { name: "serviceType", value: svc },
          ],
        },
      })
      await socketIOServer.sendNotificationToUser(updatedBooking.riderId, {
        type: "review_request",
        bookingId: courierBookingId,
        bookingType: "courier",
        bookingNumber: updatedBooking.bookingNumber,
        module: "COURIER",
        actionType: "navigate",
        screen: "riderfeedback",
        perspective: "rider",
        params: [
          { name: "bookingId", value: courierBookingId },
          { name: "perspective", value: "rider" },
          { name: "serviceType", value: svc },
        ],
        timestamp: new Date().toISOString(),
      })
    } catch (riderReviewErr) {
      console.error("notifyCourierDeliveryCompleted rider:", riderReviewErr)
    }
  }

  if (updatedBooking.orderId && updatedBooking.riderId) {
    try {
      const orderForVendors = await prisma.order.findUnique({
        where: { id: updatedBooking.orderId },
        select: {
          module: true,
          vendorId: true,
          childOrders: { select: { vendorId: true } },
          pharmacy: { select: { userId: true } },
        },
      })
      const modulesWithStore = ["FOOD", "GROCERY", "PHARMACY", "AUTO_PARTS"]
      if (orderForVendors?.module && modulesWithStore.includes(String(orderForVendors.module))) {
        const vendorUserIds = new Set<string>()
        if (orderForVendors.vendorId) vendorUserIds.add(orderForVendors.vendorId)
        for (const co of orderForVendors.childOrders || []) {
          if (co.vendorId) vendorUserIds.add(co.vendorId)
        }
        if (!orderForVendors.vendorId && orderForVendors.pharmacy?.userId) {
          vendorUserIds.add(orderForVendors.pharmacy.userId)
        }
        const svc = (String(orderForVendors.module).toLowerCase() || "courier") as string
        for (const vid of vendorUserIds) {
          if (vid === updatedBooking.customer.id) continue
          try {
            await NotificationBridge.sendNotification({
              userId: vid,
              title: "Rate your delivery partner",
              message: `Delivery #${updatedBooking.bookingNumber} is complete. Please rate your rider.`,
              type: "REVIEW_REQUEST",
              module: String(orderForVendors.module) as any,
              actionUrl: `/riderfeedback?bookingId=${encodeURIComponent(courierBookingId)}&perspective=vendor_store`,
              data: {
                actionType: "navigate",
                screen: "riderfeedback",
                bookingId: courierBookingId,
                courierBookingId,
                perspective: "vendor_store",
                params: [
                  { name: "bookingId", value: courierBookingId },
                  { name: "perspective", value: "vendor_store" },
                  { name: "serviceType", value: svc },
                ],
              },
            })
            await socketIOServer.sendNotificationToUser(vid, {
              type: "review_request",
              bookingId: courierBookingId,
              actionType: "navigate",
              screen: "riderfeedback",
              perspective: "vendor_store",
              params: [
                { name: "bookingId", value: courierBookingId },
                { name: "perspective", value: "vendor_store" },
                { name: "serviceType", value: svc },
              ],
              timestamp: new Date().toISOString(),
            })
          } catch (ve) {
            console.error("notifyCourierDeliveryCompleted vendor:", ve)
          }
        }
      }
    } catch (e) {
      console.error("notifyCourierDeliveryCompleted vendor block:", e)
    }
  }
}
