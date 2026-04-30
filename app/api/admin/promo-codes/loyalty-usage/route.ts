import { NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const POINTS_TO_CURRENCY_RATE = 100

export async function GET() {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rows = await prisma.loyaltyTransaction.findMany({
      where: { type: "REDEEMED" },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        order: { select: { id: true, orderNumber: true, module: true } },
      },
      take: 500,
    })

    const summaryByModule = new Map<string, { points: number; count: number }>()
    let totalPointsRedeemed = 0
    for (const row of rows) {
      const points = Math.abs(Number(row.points || 0))
      totalPointsRedeemed += points
      const moduleName = row.order?.module || "UNKNOWN"
      const prev = summaryByModule.get(moduleName) || { points: 0, count: 0 }
      prev.points += points
      prev.count += 1
      summaryByModule.set(moduleName, prev)
    }

    const moduleBreakdown = Array.from(summaryByModule.entries()).map(([module, data]) => ({
      module,
      redemptions: data.count,
      pointsRedeemed: data.points,
      discountAmount: Number((data.points / POINTS_TO_CURRENCY_RATE).toFixed(2)),
    }))

    return NextResponse.json({
      totalRedemptions: rows.length,
      totalPointsRedeemed,
      totalDiscountAmount: Number((totalPointsRedeemed / POINTS_TO_CURRENCY_RATE).toFixed(2)),
      moduleBreakdown,
      recentRedemptions: rows.slice(0, 50).map((row) => {
        const points = Math.abs(Number(row.points || 0))
        return {
          id: row.id,
          createdAt: row.createdAt,
          pointsRedeemed: points,
          discountAmount: Number((points / POINTS_TO_CURRENCY_RATE).toFixed(2)),
          description: row.description,
          orderId: row.orderId,
          orderNumber: row.order?.orderNumber || null,
          module: row.order?.module || "UNKNOWN",
          customerName: row.user?.name || row.user?.email || "Customer",
        }
      }),
    })
  } catch (error) {
    console.error("Admin loyalty usage report error:", error)
    return NextResponse.json({ error: "Failed to load loyalty usage report" }, { status: 500 })
  }
}
