import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from '@/lib/auth'
import { rejectIfRiderCommissionLocked } from '@/lib/rider-app-access'
import { getRiderWithdrawableBalance } from "@/lib/rider-available-balance"
import { NotificationBridge } from "@/lib/notification-bridge"



export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)

    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const riderLockResponse = rejectIfRiderCommissionLocked(session)
    if (riderLockResponse) return riderLockResponse

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

    const riderLockResponse = rejectIfRiderCommissionLocked(session)
    if (riderLockResponse) return riderLockResponse

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

    const availableBalance = await getRiderWithdrawableBalance(session.id)

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
    await NotificationBridge.sendNotification({
      userId: session.id,
      title: "Withdrawal Request Submitted",
      message: `A rider has submitted a withdrawal request of ${currency} ${amount}.`,
      type: "SYSTEM",
      module: "ADMIN",
      actionUrl: `/admin/payments#withdrawals-${withdrawal.id}`,
      data: {
        actionType: "navigate",
        screen: "AdminPaymentsWithdrawals",
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

