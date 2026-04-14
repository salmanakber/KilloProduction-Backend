import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

import { authenticateRequest } from "@/lib/auth"



export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)

    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const withdrawals = await prisma.vendorWithdrawal.findMany({
      where: { vendorId: session.id }, // Using rider id as vendorId
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
    return NextResponse.json(
      { error: "Failed to fetch withdrawals" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)

    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { bankAccountId, amount, currency, minwithdraw } = await request.json()

    

    if (!bankAccountId || !amount || amount <= 0 || amount < minwithdraw) {
      return NextResponse.json(
        { error: "Invalid withdrawal request" },
        { status: 400 }
      )
    }

    // Verify bank account belongs to rider and is verified
    const bankAccount = await prisma.vendorBankAccount.findFirst({
      where: {
        id: bankAccountId,
        vendorId: session.id,
        isVerified: true,
      },
    })

    if (!bankAccount) {
      return NextResponse.json(
        { error: "Invalid or unverified bank account" },
        { status: 400 }
      )
    }

    // Calculate available balance from rider earnings
    const allEarnings = await prisma.riderEarning.findMany({
      where: {
        riderId: session.id,
        status: "PAID",
      },
    })

    const paidEarnings = allEarnings.reduce((sum, e) => sum + e.netAmount, 0)

    const totalWithdrawn = await prisma.vendorWithdrawal.aggregate({
      where: {
        vendorId: session.id,
        status: "COMPLETED",
      },
      _sum: { amount: true },
    })

    const pendingWithdrawals = await prisma.vendorWithdrawal.aggregate({
      where: {
        vendorId: session.id,
        status: { in: ["PENDING", "APPROVED"] },
      },
      _sum: { amount: true },
    })

    const availableBalance =
      paidEarnings -
      (totalWithdrawn._sum.amount || 0) -
      (pendingWithdrawals._sum.amount || 0)

    if (amount > availableBalance) {
      return NextResponse.json(
        { error: "Insufficient available balance" },
        { status: 400 }
      )
    }

    // Minimum withdrawal amount
    if (amount < minwithdraw) {
      return NextResponse.json(
        { error: `Minimum withdrawal amount is ${currency} ${minwithdraw}` },
        { status: 400 }
      )
    }

    const withdrawal = await prisma.vendorWithdrawal.create({
      data: {
        vendorId: session.id, // Using rider id as vendorId
        bankAccountId,
        amount,
        currency: currency || "NGN",
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
    return NextResponse.json(
      { error: "Failed to create withdrawal" },
      { status: 500 }
    )
  }
}

