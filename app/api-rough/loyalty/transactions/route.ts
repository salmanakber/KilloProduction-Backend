import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = verifyToken(token)
    const userId = decoded.userId

    const transactions = await prisma.loyaltyTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    return NextResponse.json(transactions)
  } catch (error) {
    console.error("Error fetching loyalty transactions:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = verifyToken(token)
    const userId = decoded.userId
    const { type, points, description, orderId, rewardId, expiresAt } = await request.json()

    if (!type || !points || !description) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const transaction = await prisma.loyaltyTransaction.create({
      data: {
        userId,
        type,
        points,
        description,
        orderId,
        rewardId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })

    return NextResponse.json(transaction, { status: 201 })
  } catch (error) {
    console.error("Error creating loyalty transaction:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
