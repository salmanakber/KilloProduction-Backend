import { prisma } from "@/lib/prisma"
import { roundMoney2 } from "@/lib/money-round"

/** Withdrawable = cleared wallet balance minus withdrawal requests (wallet is only credited when tx completes). */
export async function getRiderWithdrawableBalance(riderId: string): Promise<number> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId: riderId },
    select: { balance: true },
  })
  const cleared = wallet?.balance ?? 0

  const totalWithdrawn = await prisma.vendorWithdrawal.aggregate({
    where: { vendorId: riderId, status: "COMPLETED" },
    _sum: { amount: true },
  })
  const pendingWithdrawals = await prisma.vendorWithdrawal.aggregate({
    where: { vendorId: riderId, status: { in: ["PENDING", "APPROVED"] } },
    _sum: { amount: true },
  })

  return roundMoney2(
    Math.max(
      0,
      cleared -
        (totalWithdrawn._sum.amount || 0) -
        (pendingWithdrawals._sum.amount || 0),
    ),
  )
}
