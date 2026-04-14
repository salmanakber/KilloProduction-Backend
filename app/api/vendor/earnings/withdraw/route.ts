import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getVendorWithdrawableBalance, scheduledPayoutDateUTC } from "@/lib/vendor-withdrawable-balance"

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

    const { withdrawable, clearingBusinessDays } = await getVendorWithdrawableBalance(user.id)
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

    // Create withdrawal request
    const withdrawal = await prisma.vendorWithdrawal.create({
      data: {
        vendorId: user.id,
        bankAccountId,
        amount,
        status: "PENDING",
        requestDate: new Date(),
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
    console.error("Withdrawal request error:", error)
    return NextResponse.json({ error: "Failed to create withdrawal request" }, { status: 500 })
  }
}
