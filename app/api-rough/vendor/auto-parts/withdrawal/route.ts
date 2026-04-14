import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get withdrawal summary
    const [totalEarnings, totalWithdrawn, pendingWithdrawals, withdrawalHistory] = await Promise.all([
      // Total earnings from delivered orders
      prisma.order.aggregate({
        where: {
          vendorId: user.id,
          module: "AUTO_PARTS",
          status: "DELIVERED",
        },
        _sum: { total: true },
      }),

      // Total withdrawn amount
      prisma.transaction.aggregate({
        where: {
          userId: user.id,
          type: "WITHDRAWAL",
          status: "COMPLETED",
        },
        _sum: { amount: true },
      }),

      // Pending withdrawals
      prisma.transaction.findMany({
        where: {
          userId: user.id,
          type: "WITHDRAWAL",
          status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
      }),

      // Withdrawal history
      prisma.transaction.findMany({
        where: {
          userId: user.id,
          type: "WITHDRAWAL",
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ])

    const totalEarned = totalEarnings._sum.total || 0
    const totalWithdrawnAmount = totalWithdrawn._sum.amount || 0
    const availableBalance = totalEarned - totalWithdrawnAmount

    return NextResponse.json({
      summary: {
        totalEarned,
        totalWithdrawn: totalWithdrawnAmount,
        availableBalance,
        pendingAmount: pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0),
      },
      pendingWithdrawals,
      withdrawalHistory,
    })
  } catch (error) {
    console.error("Withdrawal fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch withdrawal data" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { amount, bankDetails } = await request.json()

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid withdrawal amount" }, { status: 400 })
    }

    // Calculate available balance
    const [totalEarnings, totalWithdrawn] = await Promise.all([
      prisma.order.aggregate({
        where: {
          vendorId: user.id,
          module: "AUTO_PARTS",
          status: "DELIVERED",
        },
        _sum: { total: true },
      }),
      prisma.transaction.aggregate({
        where: {
          userId: user.id,
          type: "WITHDRAWAL",
          status: { in: ["COMPLETED", "PENDING"] },
        },
        _sum: { amount: true },
      }),
    ])

    const availableBalance = (totalEarnings._sum.total || 0) - (totalWithdrawn._sum.amount || 0)

    if (amount > availableBalance) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 })
    }

    // Create withdrawal request
    const withdrawal = await prisma.transaction.create({
      data: {
        userId: user.id,
        type: "WITHDRAWAL",
        amount,
        currency: "USD",
        status: "PENDING",
        description: `Withdrawal request - Auto Parts Store`,
        metadata: {
          bankDetails,
          module: "AUTO_PARTS",
        },
      },
    })

    return NextResponse.json(withdrawal, { status: 201 })
  } catch (error) {
    console.error("Withdrawal request error:", error)
    return NextResponse.json({ error: "Failed to create withdrawal request" }, { status: 500 })
  }
}
