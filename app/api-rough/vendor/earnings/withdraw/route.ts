import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { amount, bankAccountId } = await request.json()

    if (!amount || amount <= 0 || !bankAccountId) {
      return NextResponse.json({ error: "Invalid withdrawal request" }, { status: 400 })
    }

    // Verify bank account belongs to vendor and is verified
    const bankAccount = await prisma.vendorBankAccount.findFirst({
      where: {
        id: bankAccountId,
        vendorId: user.id,
        isVerified: true,
      },
    })

    if (!bankAccount) {
      return NextResponse.json({ error: "Invalid or unverified bank account" }, { status: 400 })
    }

    // Calculate available balance
    const [totalEarnings, totalWithdrawn, pendingWithdrawals] = await Promise.all([
      prisma.order.aggregate({
        where: {
          vendorId: user.id,
          status: "DELIVERED",
          paymentStatus: "PAID",
        },
        _sum: { vendorEarnings: true },
      }),

      prisma.vendorWithdrawal.aggregate({
        where: {
          vendorId: user.id,
          status: "COMPLETED",
        },
        _sum: { amount: true },
      }),

      prisma.vendorWithdrawal.aggregate({
        where: {
          vendorId: user.id,
          status: { in: ["PENDING", "APPROVED"] },
        },
        _sum: { amount: true },
      }),
    ])

    const totalEarned = totalEarnings._sum.vendorEarnings || 0
    const totalWithdrawnAmount = totalWithdrawn._sum.amount || 0
    const pendingAmount = pendingWithdrawals._sum.amount || 0
    const availableBalance = totalEarned - totalWithdrawnAmount - pendingAmount

    if (amount > availableBalance) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 })
    }

    // Create withdrawal request
    const withdrawal = await prisma.vendorWithdrawal.create({
      data: {
        vendorId: user.id,
        bankAccountId,
        amount,
        status: "PENDING",
        requestDate: new Date(),
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
    console.error("Withdrawal request error:", error)
    return NextResponse.json({ error: "Failed to create withdrawal request" }, { status: 500 })
  }
}
