import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { WalletService } from "@/lib/wallet-service"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { amount, bankAccountId, description } = body

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Valid withdrawal amount is required" },
        { status: 400 }
      )
    }

    if (!bankAccountId) {
      return NextResponse.json(
        { error: "Bank account is required for withdrawal" },
        { status: 400 }
      )
    }

    // Process withdrawal transaction
    const result = await WalletService.processWalletTransaction({
      userId: user.id,
      amount: amount,
      type: 'DEBIT',
      description: description || `Withdrawal of ${amount} NGN`,
      reference: `WITHDRAW_${Date.now()}`,
      metadata: {
        bankAccountId,
        withdrawalType: 'BANK_TRANSFER'
      }
    })

    return NextResponse.json({
      message: "Withdrawal processed successfully",
      transaction: {
        id: result.transaction.id,
        amount: result.transaction.amount,
        type: result.transaction.type,
        status: result.transaction.status,
        reference: result.transaction.reference
      },
      newBalance: result.wallet.balance
    })
  } catch (error) {
    console.error("Withdrawal error:", error)
    
    if (error instanceof Error && error.message === 'Insufficient wallet balance') {
      return NextResponse.json(
        { error: "Insufficient wallet balance" },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: "Failed to process withdrawal" },
      { status: 500 }
    )
  }
}

