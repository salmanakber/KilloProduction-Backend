import { prisma } from "@/lib/prisma"
import { markRiderEarningAsPaid } from "@/lib/rider-earnings-helper"
import { debitDeferredCustomerRideWallet } from "@/lib/deferred-ride-wallet-settlement"
import { runPayOnArrivalRideCompletion } from "@/lib/pay-on-arrival-completion"

const COMPLETION_DEBIT_REF = (rideBookingId: string) => `ride:${rideBookingId}:completion-debit`

/**
 * After a ride is COMPLETED: settle deferred wallet payment (wallet-cap flow), then rider earning + wallet payout.
 * Peak bonus progress is counted here (mobile uses /api/ride-bookings/.../status, not rider/booking).
 */
export async function runRideCompletionSideEffects(rideBookingId: string): Promise<void> {
  const booking = await prisma.rideBooking.findUnique({
    where: { id: rideBookingId },
    select: {
      id: true,
      status: true,
      riderId: true,
      customerId: true,
      paymentMethod: true,
      paymentStatus: true,
      completedAt: true,
      estimatedFare: true,
      finalFare: true,
    },
  })

  const rideTerminal =
    booking?.status === "COMPLETED" || booking?.status === "DELIVERED"
  if (!booking || !rideTerminal || !booking.riderId) {
    return
  }

  const paymentMethod = String(booking.paymentMethod || "").toUpperCase()
  if (paymentMethod === "PAY_ON_ARRIVAL") {
    await runPayOnArrivalRideCompletion(rideBookingId)
    return
  }

  const completionRef = COMPLETION_DEBIT_REF(rideBookingId)
  const fareRaw = booking.finalFare ?? booking.estimatedFare ?? 0

  try {
    await debitDeferredCustomerRideWallet({
      customerId: booking.customerId,
      paymentMethod: booking.paymentMethod,
      paymentStatus: booking.paymentStatus,
      fareToCharge: Number(fareRaw),
      completionDebitReference: completionRef,
      linkedRecordId: booking.id,
      description: `Ride payment for booking ${booking.id}`,
      metadata: {
        transactionType: "RIDE_COMPLETION_PAYMENT",
        rideBookingId,
        module: "RIDING",
      },
    })
  } catch (e) {
    console.error("[ride-post-completion] deferred wallet debit:", e)
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
