import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

/**
 * Resolve Nigerian bank account name using Paystack API
 * This endpoint uses the Paystack API key from Money Transfer Config
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user (any authenticated user can resolve accounts)
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { accountNumber, bankCode } = await request.json()

    if (!accountNumber || !bankCode) {
      return NextResponse.json(
        { error: "Account number and bank code are required" },
        { status: 400 }
      )
    }

    // Validate account number (Nigerian accounts are 10 digits)
    if (accountNumber.length !== 10 || !/^\d+$/.test(accountNumber)) {
      return NextResponse.json(
        { error: "Invalid account number. Must be 10 digits" },
        { status: 400 }
      )
    }

    // Get Paystack secret key from Money Transfer Config
    const config = await prisma.moneyTransferConfig.findFirst()
    const paystackSecretKey = config?.paystackSecretKey || process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY

console.log('paystackSecretKey', paystackSecretKey)
    if (!paystackSecretKey) {
      return NextResponse.json(
        { error: "Paystack configuration not found. Please configure Paystack in admin panel." },
        { status: 503 }
      )
    }

    // Call Paystack API to resolve account name
    const response = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
      }
    )

    const data = await response.json()

    if (!data.status) {
      return NextResponse.json(
        {
          error: data.message || "Failed to resolve account name",
          details: data.message,
        },
        { status: 400 }
      )
    }

    const resolvedAccountName = String(data.data.account_name || "").trim().toUpperCase()
    const resolvedAccountNumber = String(data.data.account_number || accountNumber).trim()
    const resolvedBankCode = String(data.data.bank_code || bankCode).trim()

    // Auto-mark matching saved accounts as verified for this authenticated user.
    // This keeps Prisma verification status aligned with successful provider verification.
    try {
      await prisma.bankAccount.updateMany({
        where: {
          userId: user.id,
          accountNumber: resolvedAccountNumber,
          OR: [{ routingNumber: resolvedBankCode }, { swiftCode: resolvedBankCode }],
        },
        data: {
          isVerified: true,
          accountHolderName: resolvedAccountName,
        },
      })

      await prisma.vendorBankAccount.updateMany({
        where: {
          vendorId: user.id,
          accountNumber: resolvedAccountNumber,
          OR: [{ routingNumber: resolvedBankCode }, { swiftCode: resolvedBankCode }],
        },
        data: {
          isVerified: true,
          verificationStatus: "VERIFIED",
          accountName: resolvedAccountName,
        },
      })
    } catch (syncError) {
      // Do not fail account resolution if syncing verification flags fails.
      console.warn("resolve-account verification sync warning:", syncError)
    }

    return NextResponse.json({
      success: true,
      accountName: resolvedAccountName,
      accountNumber: resolvedAccountNumber,
      bankCode: resolvedBankCode,
    })
  } catch (error: any) {
    console.error("Error resolving account name:", error)
    return NextResponse.json(
      { error: error.message || "Failed to resolve account name" },
      { status: 500 }
    )
  }
}
