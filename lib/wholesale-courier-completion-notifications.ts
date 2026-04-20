import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"
import { socketIOServer } from "@/lib/socket-server"

/**
 * Vendor ↔ supplier (WHOLESALER module) courier: after trip completes from the rider app,
 * prompt pharmacy, wholesaler(s), and rider to rate.
 * Uses the same socket shapes as Pharmacy/Wholesaler dashboards + pendingWholesaleVendorFeedbackStorage.
 */
export async function sendWholesaleCourierTripCompletedReviewPrompts(params: {
  courierBookingId: string
  bookingNumber?: string | null
  customerUserId: string
  /** @deprecated Rider no longer receives wholesale rating prompts from the server */
  riderUserId?: string | null
  /** COMPLETED or DELIVERED — drives booking_status_update for dashboard listeners */
  terminalStatus: string
}): Promise<void> {
  const { courierBookingId, bookingNumber, customerUserId, terminalStatus } = params

  const cb = await prisma.courierBooking.findUnique({
    where: { id: courierBookingId },
    select: { module: true },
  })
  if (!cb || cb.module !== "WHOLESALER") return

  const st = String(terminalStatus || "").toUpperCase()
  const statusForSocket = st === "COMPLETED" || st === "DELIVERED" ? st : "DELIVERED"

  const customerReviewParams = [
    { name: "bookingId", value: courierBookingId },
    { name: "serviceType", value: "courier" },
    { name: "perspective", value: "pharmacy_vendor" },
  ]

  await NotificationBridge.sendNotification({
    userId: customerUserId,
    title: "Rate rider & supplier",
    message: "Your wholesale delivery is complete. Rate the rider and the supplier.",
    type: "REVIEW_REQUEST",
    module: "COURIER",
    /** Deep link for mobile NotificationScreen / navigateFromNotification */
    actionUrl: `/riderfeedback?bookingId=${encodeURIComponent(courierBookingId)}&perspective=pharmacy_vendor`,
    data: {
      actionType: "navigate",
      screen: "riderfeedback",
      bookingId: courierBookingId,
      courierBookingId: courierBookingId,
      perspective: "pharmacy_vendor",
      params: customerReviewParams,
    },
  })

  const supplierRows = await prisma.supplierOrder.findMany({
    where: { courierBookingId },
    select: { wholesaler: { select: { userId: true } } },
  })
  const wholesalerUserIds = [...new Set(supplierRows.map((r) => r.wholesaler?.userId).filter(Boolean))] as string[]

  /** Pharmacy dashboard listens for booking_status_update + review_request → setPendingWholesaleVendorFeedback */
  try {
    await socketIOServer.sendNotificationToUser(customerUserId, {
      type: "booking_status_update",
      bookingId: courierBookingId,
      bookingType: "courier",
      status: statusForSocket,
      bookingNumber,
      module: "WHOLESALER",
      openReviewModal: true,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    console.error("Wholesale pharmacy booking_status_update socket:", e)
  }

  try {
    await socketIOServer.sendNotificationToUser(customerUserId, {
      type: "review_request",
      bookingId: courierBookingId,
      bookingNumber,
      actionType: "navigate",
      screen: "riderfeedback",
      params: customerReviewParams,
      openReviewModal: true,
      module: "WHOLESALER",
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    console.error("Wholesale pharmacy review_request socket:", e)
  }

  const seen = new Set<string>()
  for (const wuid of wholesalerUserIds) {
    if (!wuid || seen.has(wuid)) continue
    seen.add(wuid)
    const paramsArr = [
      { name: "bookingId", value: courierBookingId },
      { name: "perspective", value: "wholesaler_vendor" },
    ]
    try {
      await NotificationBridge.sendNotification({
        userId: wuid,
        title: "Rate this delivery",
        message: "The wholesale delivery is complete. Share quick feedback.",
        type: "REVIEW_REQUEST",
        module: "PHARMACY",
        actionUrl: `/riderfeedback?bookingId=${encodeURIComponent(courierBookingId)}&perspective=wholesaler_vendor`,
        data: {
          actionType: "navigate",
          screen: "riderfeedback",
          bookingId: courierBookingId,
          courierBookingId: courierBookingId,
          perspective: "wholesaler_vendor",
          params: paramsArr,
        },
      })
      await socketIOServer.sendNotificationToUser(wuid, {
        type: "booking_status_update",
        bookingId: courierBookingId,
        bookingType: "courier",
        status: statusForSocket,
        bookingNumber,
        module: "WHOLESALER",
        openReviewModal: true,
        timestamp: new Date().toISOString(),
      })
      await socketIOServer.sendNotificationToUser(wuid, {
        type: "review_request",
        bookingId: courierBookingId,
        actionType: "navigate",
        screen: "riderfeedback",
        params: paramsArr,
        openReviewModal: true,
        module: "WHOLESALER",
        timestamp: new Date().toISOString(),
      })
    } catch (e) {
      console.error("Wholesaler review notification:", e)
    }
  }

  /** Rider does not rate pharmacy/supplier on wholesale runs — vendor + wholesaler get review prompts only. */
}
