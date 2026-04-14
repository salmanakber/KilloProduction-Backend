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

    if (!rewardId) {
      return NextResponse.json({ error: "Reward ID is required" }, { status: 400 })
    }

    // Get reward details
    const reward = await prisma.loyaltyReward.findUnique({
      where: { id: rewardId },
    })

    if (!reward || !reward.isActive) {
      return NextResponse.json({ error: "Reward not found or inactive" }, { status: 404 })
    }

    // Check if reward is still valid
    if (reward.validUntil && reward.validUntil < new Date()) {
      return NextResponse.json({ error: "Reward has expired" }, { status: 400 })
    }

    // Check redemption limit
    if (reward.maxRedemptions && reward.currentRedemptions >= reward.maxRedemptions) {
      return NextResponse.json({ error: "Reward redemption limit reached" }, { status: 400 })
    }

    // Calculate user's available points
    const loyaltyTransactions = await prisma.loyaltyTransaction.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
    })

    const totalPoints = loyaltyTransactions.reduce((sum, transaction) => {
      return transaction.type === "EARNED" || transaction.type === "BONUS" || transaction.type === "REFERRAL"
        ? sum + transaction.points
        : sum - transaction.points
    }, 0)

    if (totalPoints < reward.pointsRequired) {
      return NextResponse.json({ error: "Insufficient loyalty points" }, { status: 400 })
    }

    // Create redemption and deduct points
    const [redemption] = await prisma.$transaction([
      prisma.rewardRedemption.create({
        data: {
          userId,
          rewardId,
          pointsUsed: reward.pointsRequired,
          status: "ACTIVE",
          expiresAt: reward.validUntil,
        },
      }),
      prisma.loyaltyTransaction.create({
        data: {
          userId,
          type: "REDEEMED",
          points: reward.pointsRequired,
          description: `Redeemed: ${reward.title}`,
          rewardId,
        },
      }),
      prisma.loyaltyReward.update({
        where: { id: rewardId },
        data: { currentRedemptions: { increment: 1 } },
      }),
    ])

    return NextResponse.json(redemption, { status: 201 })
  } catch (error) {
    console.error("Error redeeming reward:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
