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

    const withdrawals = await prisma.vendorWithdrawal.findMany({
      where: { vendorId: userId },
      include: {
        bankAccount: {
          select: {
            bankName: true,
            accountNumber: true,
            accountName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(withdrawals)
  } catch (error) {
    console.error("Error fetching withdrawals:", error)
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

    const { bankAccountId, amount, currency } = await request.json()

    if (!bankAccountId || !amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid withdrawal request" }, { status: 400 })
    }

    // Verify bank account belongs to vendor and is verified
    const bankAccount = await prisma.vendorBankAccount.findFirst({
      where: {
        id: bankAccountId,
        vendorId: userId,
        isVerified: true,
      },
    })

    if (!bankAccount) {
      return NextResponse.json({ error: "Invalid or unverified bank account" }, { status: 400 })
    }

    // Calculate available balance (this would need to be implemented based on your business logic)
    // For now, we'll assume the vendor has sufficient balance

    const withdrawal = await prisma.vendorWithdrawal.create({
      data: {
        vendorId: userId,
        bankAccountId,
        amount,
        currency: currency || "USD",
        status: "PENDING",
      },
      include: {
        bankAccount: {
          select: {
            bankName: true,
            accountNumber: true,
            accountName: true,
          },
        },
      },
    })

    return NextResponse.json(withdrawal, { status: 201 })
  } catch (error) {
    console.error("Error creating withdrawal:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
