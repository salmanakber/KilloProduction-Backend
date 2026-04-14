import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const module = searchParams.get("module")

    const rewards = await prisma.loyaltyReward.findMany({
      where: {
        isActive: true,
        ...(module && { modules: { has: module } }),
        OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
      },
      orderBy: { pointsRequired: "asc" },
    })

    return NextResponse.json(rewards)
  } catch (error) {
    console.error("Error fetching loyalty rewards:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const {
      title,
      description,
      pointsRequired,
      rewardType,
      rewardValue,
      maxRedemptions,
      modules,
      validUntil,
      terms,
      image,
    } = await request.json()

    if (!title || !pointsRequired || !rewardType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const reward = await prisma.loyaltyReward.create({
      data: {
        title,
        description,
        pointsRequired,
        rewardType,
        rewardValue,
        maxRedemptions,
        modules,
        validUntil: validUntil ? new Date(validUntil) : null,
        terms,
        image,
      },
    })

    return NextResponse.json(reward, { status: 201 })
  } catch (error) {
    console.error("Error creating loyalty reward:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
