import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const transactions = await prisma.loyaltyTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    return NextResponse.json(transactions)
  } catch (error) {
    console.error("Error fetching loyalty transactions:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
