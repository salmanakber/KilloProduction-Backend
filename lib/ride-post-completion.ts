import { prisma } from "@/lib/prisma"
import { markRiderEarningAsPaid } from "@/lib/rider-earnings-helper"

/**
 * After a ride is COMPLETED: settle customer payment state and mark rider earning + wallet payout.
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
}
