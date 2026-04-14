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
    const { type, amount, description, reference, orderId } = await request.json()

    if (!type || !amount || !description) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Get current wallet balance
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    })

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 })
    }

    // Calculate new balance
    const newBalance =
      type === "CREDIT" || type === "DEPOSIT" || type === "REFUND" || type === "BONUS" || type === "CASHBACK"
        ? wallet.balance + amount
        : wallet.balance - amount

    if (newBalance < 0 && (type === "DEBIT" || type === "WITHDRAWAL")) {
      return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 400 })
    }

    // Create transaction and update wallet balance
    const [transaction] = await prisma.$transaction([
      prisma.walletTransaction.create({
        data: {
          userId,
          type,
          amount,
          balance: newBalance,
          description,
          reference,
          orderId,
          status: "COMPLETED",
        },
      }),
      prisma.wallet.update({
        where: { userId },
        data: { balance: newBalance },
      }),
    ])

    return NextResponse.json(transaction, { status: 201 })
  } catch (error) {
    console.error("Error creating wallet transaction:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
