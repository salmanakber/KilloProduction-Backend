import { prisma } from "@/lib/prisma"
import { bumpRiderBonusOnDeliveryEarning } from "@/lib/rider-bonus-engine"

const PAYABLE_DUE_DAYS = 3

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Pay-on-Arrival ride completion: customer paid rider in cash; platform commission
 * is tracked as RiderPayableCommission for wallet recovery (no rider wallet credit).
 */
export async function runPayOnArrivalRideCompletion(rideBookingId: string): Promise<void> {
  const booking = await prisma.rideBooking.findUnique({
    where: { id: rideBookingId },
    select: {
      id: true,
      status: true,
      riderId: true,
      paymentMethod: true,
      completedAt: true,
    },
  })

  const rideTerminal =
    booking?.status === "COMPLETED" || booking?.status === "DELIVERED"
  if (!booking || !rideTerminal || !booking.riderId) return

  const paymentMethod = String(booking.paymentMethod || "").toUpperCase()
  if (paymentMethod !== "PAY_ON_ARRIVAL") return

  const riderId = booking.riderId
  const existingPayable = await prisma.riderPayableCommission.findUnique({
    where: { rideBookingId },
    select: { id: true },
  })
  if (existingPayable) return

  const pendingRows = await prisma.riderEarning.findMany({
    where: { rideBookingId, riderId, status: "PENDING" },
  })

  if (pendingRows.length === 0) {
    void bumpRiderBonusOnDeliveryEarning(riderId).catch(() => {})
    return
  }

  const riderCommission = await prisma.riderCommission.findFirst({
    where: { rideBookingId, riderId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  })

  const commissionAmount = round2(Number(riderCommission?.commissionAmount || 0))
  const dueAt = new Date(Date.now() + PAYABLE_DUE_DAYS * 24 * 60 * 60 * 1000)

  const wallet = await prisma.wallet.findUnique({
    where: { userId: riderId },
    select: { currency: true },
  })
  const currency = wallet?.currency || "USD"

  await prisma.$transaction(async (tx) => {
    await tx.riderEarning.updateMany({
      where: { rideBookingId, riderId, status: "PENDING" },
      data: { status: "PAID", paidAt: new Date() },
    })

    await tx.rideBooking.update({
      where: { id: rideBookingId },
      data: {
        paymentStatus: "PAID",
        ...(booking.completedAt ? {} : { completedAt: new Date() }),
      },
    })

    if (commissionAmount > 0) {
      await tx.riderPayableCommission.create({
        data: {
          riderId,
          rideBookingId,
          riderCommissionId: riderCommission?.id ?? null,
          commissionAmount,
          currency,
          status: "PENDING",
          dueAt,
        },
      })
    } else if (riderCommission?.id) {
      await tx.riderCommission.update({
        where: { id: riderCommission.id },
        data: { status: "PAID", paidAt: new Date() },
      })
    }

    /** Remove any stale pending payout rows — rider was paid in cash. */
    await tx.walletTransaction.deleteMany({
      where: {
        userId: riderId,
        reference: `earning-payout:ride:${rideBookingId}`,
        status: "PENDING",
      },
    })
  })

  void bumpRiderBonusOnDeliveryEarning(riderId).catch(() => {})
}
