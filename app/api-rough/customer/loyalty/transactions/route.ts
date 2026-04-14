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
