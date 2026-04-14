import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getVendorWithdrawableBalance, scheduledPayoutDateUTC } from "@/lib/vendor-withdrawable-balance"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)  
    if (!session || session.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const withdrawals = await prisma.vendorWithdrawal.findMany({
      where: { vendorId: session.id },
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
    const session = await authenticateRequest(request)  
    if (!session || session.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { bankAccountId, amount, currency } = await request.json()

    if (!bankAccountId || !amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid withdrawal request" }, { status: 400 })
    }

    // Verify bank account belongs to vendor and is verified
    const bankAccount = await prisma.vendorBankAccount.findFirst({
      where: {
        id: bankAccountId,
        vendorId: session.id,
        isVerified: true,
      },
    })

    if (!bankAccount) {
      return NextResponse.json({ error: "Invalid or unverified bank account" }, { status: 400 })
    }

    const { withdrawable, clearingBusinessDays } = await getVendorWithdrawableBalance(session.id)
    if (amount > withdrawable) {
      return NextResponse.json(
        {
          error: "Insufficient balance",
          details: `Only cleared wallet funds (after ${clearingBusinessDays} business days) are available.`,
        },
        { status: 400 }
      )
    }

    const scheduledProcessDate = scheduledPayoutDateUTC(clearingBusinessDays)
    const notesPayload = {
      scheduledProcessDate: scheduledProcessDate.toISOString(),
      clearingBusinessDays,
      message: "Bank payout is scheduled after business-day clearing; weekends and holidays excluded.",
    }

    const withdrawal = await prisma.vendorWithdrawal.create({
      data: {
        vendorId: session.id,
        bankAccountId,
        amount,
        currency: currency || "USD",
        status: "PENDING",
        notes: JSON.stringify(notesPayload),
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
