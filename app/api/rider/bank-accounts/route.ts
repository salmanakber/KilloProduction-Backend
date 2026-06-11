import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from '@/lib/auth'
import { rejectIfRiderCommissionLocked } from '@/lib/rider-app-access'
import {
  BankAccountResolveError,
  requireVerifiedBankAccount,
} from "@/lib/resolve-bank-account"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)

    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const riderLockResponse = rejectIfRiderCommissionLocked(session)
    if (riderLockResponse) return riderLockResponse

    const bankAccounts = await prisma.vendorBankAccount.findMany({
      where: {
        vendorId: session.id, // Using rider id as vendorId
      },
      orderBy: [
        { isPrimary: "desc" },
        { createdAt: "desc" },
      ],
    })

    // Transform to match GlobalBankScreen interface
    const transformed = bankAccounts.map((acc) => ({
      id: acc.id,
      accountName: acc.accountName,
      accountNumber: acc.accountNumber,
      bankName: acc.bankName,
      bankCode: acc.bankCode || acc.routingNumber || acc.swiftCode || "",
      swiftCode: acc.swiftCode,
      routingNumber: acc.routingNumber,
      isDefault: acc.isPrimary,
      isPrimary: acc.isPrimary,
      isVerified: acc.isVerified,
      createdAt: acc.createdAt.toISOString(),
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error("Error fetching bank accounts:", error)
    return NextResponse.json(
      { error: "Failed to fetch bank accounts" },
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

    const body = await request.json()
    const {
      bankName,
      accountNumber,
      accountName,
      bankCode,
      routingNumber,
      swiftCode,
      branchCode,
      accountType,
      currency,
      isPrimary,
    } = body

    const resolvedBankCode = String(routingNumber || bankCode || "").trim()
    if (!bankName || !accountNumber || !resolvedBankCode) {
      return NextResponse.json(
        { error: "Bank name, account number, and bank code are required" },
        { status: 400 }
      )
    }

    let verified: Awaited<ReturnType<typeof requireVerifiedBankAccount>>
    try {
      verified = await requireVerifiedBankAccount({
        accountNumber,
        bankCode: resolvedBankCode,
        userId: session.id,
      })
    } catch (err) {
      if (err instanceof BankAccountResolveError) {
        return NextResponse.json({ error: err.message }, { status: err.status })
      }
      throw err
    }

    // Check for duplicate account number
    const existingAccount = await prisma.vendorBankAccount.findFirst({
      where: {
        vendorId: session.id,
        accountNumber: accountNumber.trim(),
      },
    })

    if (existingAccount) {
      return NextResponse.json(
        { error: "Bank account with this account number already exists" },
        { status: 400 }
      )
    }

    // If this is set as primary, unset other primary accounts
    if (isPrimary) {
      await prisma.vendorBankAccount.updateMany({
        where: {
          vendorId: session.id,
          isPrimary: true,
        },
        data: {
          isPrimary: false,
        },
      })
    }

    const bankAccount = await prisma.vendorBankAccount.create({
      data: {
        vendorId: session.id,
        bankName: bankName.trim(),
        accountNumber: verified.accountNumber,
        accountName: verified.accountName,
        bankCode: verified.bankCode,
        routingNumber: verified.bankCode,
        swiftCode: swiftCode?.trim() || null,
        branchCode: branchCode?.trim() || null,
        accountType: accountType || "checking",
        currency: currency || "NGN",
        isPrimary: isPrimary || false,
        isVerified: true,
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
      },
    })

    return NextResponse.json(bankAccount, { status: 201 })
  } catch (error) {
    console.error("Error creating bank account:", error)
    return NextResponse.json(
      { error: "Failed to create bank account" },
      { status: 500 }
    )
  }
}




