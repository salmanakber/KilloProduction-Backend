import { prisma } from "@/lib/prisma"
import { markRiderEarningAsPaid } from "@/lib/rider-earnings-helper"
import { bumpRiderBonusOnDeliveryEarning } from "@/lib/rider-bonus-engine"

/**
 * After a ride is COMPLETED: settle customer payment state and mark rider earning + wallet payout.
 * Peak bonus progress is counted here (mobile uses /api/ride-bookings/.../status, not rider/booking).
 */
export async function runRideCompletionSideEffects(rideBookingId: string): Promise<void> {
  const booking = await prisma.rideBooking.findUnique({
    where: { id: rideBookingId },
    select: { id: true, status: true, riderId: true, completedAt: true },
  })

  if (!booking || booking.status !== "COMPLETED" || !booking.riderId) {
    return
  }

  await prisma.rideBooking.update({
    where: { id: rideBookingId },
    data: {
      paymentStatus: "PAID",
      ...(booking.completedAt ? {} : { completedAt: new Date() }),
    },
  })

  await markRiderEarningAsPaid(rideBookingId)
  void bumpRiderBonusOnDeliveryEarning(booking.riderId).catch(() => {})
}
