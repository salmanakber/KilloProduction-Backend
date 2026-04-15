import { prisma } from "@/lib/prisma"
import { getInternalServiceBearerToken } from "@/lib/internal-bearer-auth"

const TERMINAL: string[] = ["CANCELLED", "REFUNDED", "WITHDRAWN", "EXPIRED"]

/**
 * BullMQ worker: validate FOOD order, promote booking to REQUESTED, ping API to broadcast over Socket.IO.
 */
export async function processFoodRiderDispatchJob(data: {
  courierBookingId: string
  orderId: string
}): Promise<void> {
  const { courierBookingId, orderId } = data

  const booking = await prisma.courierBooking.findUnique({
    where: { id: courierBookingId },
  })

  if (!booking || booking.module !== "FOOD") return
  if ((booking.status as any) !== "AWAITING_PREP") return

  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) return

  if (TERMINAL.includes(order.status)) {
    await prisma.courierBooking.update({
      where: { id: courierBookingId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    })
    await prisma.courierTracking.create({
      data: {
        bookingId: courierBookingId,
        status: "CANCELLED",
        notes: "Food rider dispatch skipped — order inactive",
      },
    })
    return
  }

  await prisma.courierBooking.update({
    where: { id: courierBookingId },
    data: { status: "REQUESTED" },
  })

  await prisma.courierTracking.create({
    data: {
      bookingId: courierBookingId,
      status: "REQUESTED",
      notes: "Rider booking opened after kitchen prep window",
    },
  })

  const token = getInternalServiceBearerToken()
  const base =
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://127.0.0.1:3000"

  if (!token) {
    console.warn(
      "[food-rider-dispatch] Set CRON_SECRET or FOOD_DISPATCH_INTERNAL_SECRET for socket broadcast (same Bearer as cron routes)"
    )
    return
  }
  const baseNoApi = base.replace(/\/api\/?$/, "").replace(/\/$/, "")
  const url = `${baseNoApi}/api/internal/food-courier-broadcast`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ courierBookingId }),
  })

  if (!res.ok) {
    const t = await res.text().catch(() => "")
    console.error("[food-rider-dispatch] broadcast HTTP error", res.status, t)
  }
}
