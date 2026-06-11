import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import {
  BankAccountResolveError,
  requireVerifiedBankAccount,
} from "@/lib/resolve-bank-account"

/**
 * Resolve Nigerian bank account name using Paystack API
 * This endpoint uses the Paystack API key from Money Transfer Config
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { accountNumber, bankCode } = await request.json()

    const resolved = await requireVerifiedBankAccount({
      accountNumber,
      bankCode,
      userId: user.id,
    })

    return NextResponse.json({
      success: true,
      accountName: resolved.accountName,
      accountNumber: resolved.accountNumber,
      bankCode: resolved.bankCode,
    })
  } catch (error: any) {
    if (error instanceof BankAccountResolveError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Error resolving account name:", error)
    return NextResponse.json(
      { error: error.message || "Failed to resolve account name" },
      { status: 500 }
    )
  }
}
