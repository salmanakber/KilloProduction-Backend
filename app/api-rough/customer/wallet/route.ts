import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get or create wallet
    let wallet = await prisma.wallet.findUnique({
      where: { userId: user.id },
    })

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          balance: 0,
          currency: "USD",
          isActive: true,
        },
      })
    }

    // Get transactions
    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    })

    // Calculate totals
    const [totalEarned, totalSpent] = await Promise.all([
      prisma.walletTransaction.aggregate({
        where: {
          walletId: wallet.id,
          type: { in: ["CREDIT", "REFUND", "CASHBACK"] },
          status: "COMPLETED",
        },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: {
          walletId: wallet.id,
          type: "DEBIT",
          status: "COMPLETED",
        },
        _sum: { amount: true },
      }),
    ])

    // Get loyalty points
    const loyaltyPoints = await prisma.loyaltyPoint.aggregate({
      where: {
        userId: user.id,
        isActive: true,
      },
      _sum: { points: true },
    })

    return NextResponse.json({
      balance: wallet.balance,
      currency: wallet.currency,
      totalEarned: totalEarned._sum.amount || 0,
      totalSpent: totalSpent._sum.amount || 0,
      transactions,
      loyaltyPoints: loyaltyPoints._sum.points || 0,
    })
  } catch (error) {
    console.error("Wallet fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch wallet data" }, { status: 500 })
  }
}
