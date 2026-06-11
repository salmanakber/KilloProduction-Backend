import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const { accountNumber, bankCode } = await request.json()
    if (!accountNumber || !bankCode) {
      return NextResponse.json({ error: "Account number and bank code are required" }, { status: 400 })
    }
    if (accountNumber.length !== 10 || !/^\d+$/.test(String(accountNumber))) {
      return NextResponse.json({ error: "Invalid account number. Must be 10 digits" }, { status: 400 })
    }

    const config = await prisma.moneyTransferConfig.findFirst()
    const paystackSecretKey = config?.paystackSecretKey || process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY
    if (!paystackSecretKey) {
      return NextResponse.json({ error: "Bank verification is temporarily unavailable" }, { status: 503 })
    }

    const response = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${paystackSecretKey}` },
      }
    )
    const data = await response.json()
    if (!data.status) {
      return NextResponse.json({ error: data.message || "Could not verify account" }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      accountName: String(data.data.account_name || "").trim().toUpperCase(),
      accountNumber: String(data.data.account_number || accountNumber),
    })
  } catch (error) {
    console.error("Property resolve-bank error:", error)
    return NextResponse.json({ error: "Failed to verify bank account" }, { status: 500 })
  }
}
