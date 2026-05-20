import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getSystemDefaultCurrency } from "@/lib/money-transfer-wallet"

function normalizeBankCurrency(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().toUpperCase().slice(0, 3)
  }
  return fallback
}

function mapBankAccount(acc: {
  id: string
  accountHolderName: string
  accountNumber: string
  bankName: string
  routingNumber: string | null
  swiftCode: string | null
  currency: string
  isDefault: boolean
  isVerified: boolean
  createdAt: Date
}) {
  return {
    id: acc.id,
    accountName: acc.accountHolderName,
    accountNumber: acc.accountNumber,
    bankName: acc.bankName,
    bankCode: acc.routingNumber || acc.swiftCode || "",
    swiftCode: acc.swiftCode,
    routingNumber: acc.routingNumber,
    currency: acc.currency,
    isDefault: acc.isDefault,
    isVerified: acc.isVerified,
    createdAt: acc.createdAt.toISOString(),
  }
}

/**
 * Bank accounts for customers (used for money transfer)
 * These require admin verification before they can be used for money transfer
 */
export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const bankAccounts = await prisma.bankAccount.findMany({
      where: { userId: session.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    })

    const transformed = bankAccounts.map(mapBankAccount)

    return NextResponse.json(transformed)
  } catch (error) {
    console.error("Error fetching bank accounts:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      accountName,
      accountNumber,
      bankName,
      bankCode,
      swiftCode,
      routingNumber,
      isDefault,
      currency: bodyCurrency,
    } = body

    const defaultCurrency = await getSystemDefaultCurrency()
    const currency = normalizeBankCurrency(bodyCurrency, defaultCurrency)

    // Validate required fields
    if (!accountName || !accountNumber || !bankName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // If setting as default, unset other default accounts
    if (isDefault) {
      await prisma.bankAccount.updateMany({
        where: { userId: session.id, isDefault: true },
        data: { isDefault: false },
      })
    }

    const bankAccount = await prisma.bankAccount.create({
      data: {
        userId: session.id,
        accountHolderName: accountName.trim().toUpperCase(),
        accountNumber: accountNumber.trim(),
        bankName: bankName.trim(),
        routingNumber: routingNumber || bankCode || null,
        swiftCode: swiftCode || null,
        accountType: "checking",
        currency,
        isDefault: isDefault || false,
        isVerified: true,
      },
    })

    return NextResponse.json(mapBankAccount(bankAccount), { status: 201 })
  } catch (error: any) {
    console.error("Error creating bank account:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
