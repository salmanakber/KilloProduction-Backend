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

    const transactions = await prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    return NextResponse.json(transactions)
  } catch (error) {
    console.error("Error fetching wallet transactions:", error)
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
    const { type, amount, description, reference } = await request.json()

    // Create transaction
    const transaction = await prisma.walletTransaction.create({
      data: {
        userId,
        type,
        amount,
        description,
        reference,
        status: "COMPLETED",
      },
    })

    // Update wallet balance
    const currentWallet = await prisma.wallet.findUnique({
      where: { userId },
    })

    if (!currentWallet) {
      await prisma.wallet.create({
        data: {
          userId,
          balance: type === "CREDIT" ? amount : -amount,
        },
      })
    } else {
      await prisma.wallet.update({
        where: { userId },
        data: {
          balance: type === "CREDIT" ? currentWallet.balance + amount : currentWallet.balance - amount,
        },
      })
    }

    return NextResponse.json(transaction)
  } catch (error) {
    console.error("Error creating wallet transaction:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
