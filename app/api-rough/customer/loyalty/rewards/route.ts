import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const rewards = await prisma.loyaltyReward.findMany({
      where: { isActive: true },
      orderBy: { pointsRequired: "asc" },
    })

    return NextResponse.json(rewards)
  } catch (error) {
    console.error("Error fetching loyalty rewards:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
