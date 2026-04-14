import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get available points (not redeemed and not expired)
    const availablePointsResult = await prisma.loyaltyPoint.aggregate({
      where: {
        userId: user.id,
        isRedeemed: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      _sum: { points: true }
    })

    // Get total points earned (all time)
    const totalPointsResult = await prisma.loyaltyPoint.aggregate({
      where: {
        userId: user.id,
        type: "EARNED"
      },
      _sum: { points: true }
    })

    const availablePoints = availablePointsResult._sum.points || 0
    const totalPoints = totalPointsResult._sum.points || 0

    // Determine tier based on total points
    let tier = "BRONZE"
    let nextTierPoints = 1000

    if (totalPoints >= 10000) {
      tier = "PLATINUM"
      nextTierPoints = 0 // Max tier
    } else if (totalPoints >= 5000) {
      tier = "GOLD"
      nextTierPoints = 10000
    } else if (totalPoints >= 1000) {
      tier = "SILVER"
      nextTierPoints = 5000
    } else {
      tier = "BRONZE"
      nextTierPoints = 1000
    }

    return NextResponse.json({
      totalPoints,
      availablePoints,
      tier,
      nextTierPoints,
    })
  } catch (error) {
    console.error("Error fetching loyalty data:", error)
    return NextResponse.json(
      { error: "Failed to fetch loyalty data" },
      { status: 500 }
    )
  }
}

