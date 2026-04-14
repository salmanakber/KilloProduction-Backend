import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)

    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get all rider earnings
    const allEarnings = await prisma.riderEarning.findMany({
      where: {
        riderId: session.id,
      },
    })

    // Calculate totals
    const totalEarnings = allEarnings.reduce((sum, e) => sum + e.netAmount, 0)
    const paidEarnings = allEarnings
      .filter((e) => e.status === "PAID")
      .reduce((sum, e) => sum + e.netAmount, 0)
    const pendingEarnings = allEarnings
      .filter((e) => e.status === "PENDING")
      .reduce((sum, e) => sum + e.netAmount, 0)

    // Get total withdrawn
    const totalWithdrawn = await prisma.vendorWithdrawal.aggregate({
      where: {
        vendorId: session.id, // Using rider id as vendorId
        status: "COMPLETED",
      },
      _sum: { amount: true },
    })

    // Get pending withdrawals
    const pendingWithdrawals = await prisma.vendorWithdrawal.aggregate({
      where: {
        vendorId: session.id,
        status: { in: ["PENDING", "APPROVED"] },
      },
      _sum: { amount: true },
    })

    const available = paidEarnings - (totalWithdrawn._sum.amount || 0) - (pendingWithdrawals._sum.amount || 0)

    return NextResponse.json({
      total: totalEarnings,
      available: Math.max(0, available),
      pending: pendingEarnings,
      frozen: 0, // Can be used for other purposes
      totalWithdrawn: totalWithdrawn._sum.amount || 0,
    })
  } catch (error) {
    console.error("Error fetching rider wallet balance:", error)
    return NextResponse.json(
      { error: "Failed to fetch wallet balance" },
      { status: 500 }
    )
  }
}




