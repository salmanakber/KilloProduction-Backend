import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

    // Get total earnings from completed orders
    const [totalEarnings, totalWithdrawn, pendingWithdrawals, thisMonthEarnings, lastMonthEarnings, orderStats] =
      await Promise.all([
        // Total earned from delivered orders
        prisma.order.aggregate({
          where: {
            vendorId: user.id,
            status: "DELIVERED",
            paymentStatus: "PAID",
          },
          _sum: { vendorEarnings: true },
        }),

        // Total withdrawn (completed withdrawals)
        prisma.vendorWithdrawal.aggregate({
          where: {
            vendorId: user.id,
            status: "COMPLETED",
          },
          _sum: { amount: true },
        }),

        // Pending withdrawals
        prisma.vendorWithdrawal.aggregate({
          where: {
            vendorId: user.id,
            status: { in: ["PENDING", "APPROVED"] },
          },
          _sum: { amount: true },
        }),

        // This month earnings
        prisma.order.aggregate({
          where: {
            vendorId: user.id,
            status: "DELIVERED",
            paymentStatus: "PAID",
            createdAt: { gte: startOfMonth },
          },
          _sum: { vendorEarnings: true },
        }),

        // Last month earnings
        prisma.order.aggregate({
          where: {
            vendorId: user.id,
            status: "DELIVERED",
            paymentStatus: "PAID",
            createdAt: {
              gte: startOfLastMonth,
              lte: endOfLastMonth,
            },
          },
          _sum: { vendorEarnings: true },
        }),

        // Order statistics
        prisma.order.aggregate({
          where: {
            vendorId: user.id,
            status: "DELIVERED",
          },
          _count: { id: true },
          _avg: { total: true },
        }),
      ])

    const totalEarned = totalEarnings._sum.vendorEarnings || 0
    const totalWithdrawnAmount = totalWithdrawn._sum.amount || 0
    const pendingAmount = pendingWithdrawals._sum.amount || 0
    const availableBalance = totalEarned - totalWithdrawnAmount - pendingAmount

    const summary = {
      totalEarned,
      totalWithdrawn: totalWithdrawnAmount,
      availableBalance: Math.max(0, availableBalance),
      pendingAmount,
      thisMonthEarnings: thisMonthEarnings._sum.vendorEarnings || 0,
      lastMonthEarnings: lastMonthEarnings._sum.vendorEarnings || 0,
      averageOrderValue: orderStats._avg.total || 0,
      totalOrders: orderStats._count.id || 0,
    }

    return NextResponse.json(summary)
  } catch (error) {
    console.error("Earnings summary error:", error)
    return NextResponse.json({ error: "Failed to fetch earnings summary" }, { status: 500 })
  }
}
