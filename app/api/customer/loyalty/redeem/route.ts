import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = verifyToken(token)
    const userId = decoded.userId
    const { rewardId } = await request.json()

    // Get reward details
    const reward = await prisma.loyaltyReward.findUnique({
      where: { id: rewardId },
    })

    if (!reward || !reward.isActive) {
      return NextResponse.json({ error: "Reward not found or inactive" }, { status: 404 })
    }

    // Get user's current points
    const loyalty = await prisma.loyalty.findUnique({
      where: { userId },
    })

    if (!loyalty || loyalty.availablePoints < reward.pointsRequired) {
      return NextResponse.json({ error: "Insufficient points" }, { status: 400 })
    }

    // Create redemption transaction
    await prisma.loyaltyTransaction.create({
      data: {
        userId,
        type: "REDEEMED",
        points: reward.pointsRequired,
        description: `Redeemed: ${reward.title}`,
        orderId: null,
      },
    })

    // Update user's points
    await prisma.loyalty.update({
      where: { userId },
      data: {
        availablePoints: loyalty.availablePoints - reward.pointsRequired,
      },
    })

    // Create reward redemption record
    const redemption = await prisma.rewardRedemption.create({
      data: {
        userId,
        rewardId,
        pointsUsed: reward.pointsRequired,
        status: "ACTIVE",
      },
    })

    return NextResponse.json(redemption)
  } catch (error) {
    console.error("Error redeeming reward:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
