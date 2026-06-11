import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import {
  BankAccountResolveError,
  requireVerifiedBankAccount,
} from "@/lib/resolve-bank-account"

export async function GET(
  request: NextRequest,
  { params }: { params: { userType: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get bank accounts based on user type
    const bankAccounts = await prisma.vendorBankAccount.findMany({
      where: { vendorId: session.id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    })

    // Transform to match GlobalBankScreen interface
    const transformed = bankAccounts.map((acc) => ({
      id: acc.id,
      accountName: acc.accountName,
      accountNumber: acc.accountNumber,
      bankName: acc.bankName,
      bankCode: acc.routingNumber || acc.swiftCode || "",
      swiftCode: acc.swiftCode,
      routingNumber: acc.routingNumber,
      isDefault: acc.isPrimary,
      isVerified: acc.isVerified,
      createdAt: acc.createdAt.toISOString(),
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error("Error fetching bank accounts:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { userType: string } }
) {
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
    } = body

    const resolvedBankCode = String(routingNumber || bankCode || "").trim()

    if (!accountNumber || !bankName || !resolvedBankCode) {
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

    // If setting as default/primary, unset other primary accounts
    if (isDefault) {
      await prisma.vendorBankAccount.updateMany({
        where: { vendorId: session.id, isPrimary: true },
        data: { isPrimary: false },
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
        swiftCode: swiftCode || null,
        isPrimary: isDefault || false,
        isVerified: true,
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
        currency: "NGN",
        accountType: "checking",
      },
    })

    // Transform response
    return NextResponse.json(
      {
        id: bankAccount.id,
        accountName: bankAccount.accountName,
        accountNumber: bankAccount.accountNumber,
        bankName: bankAccount.bankName,
        bankCode: bankAccount.routingNumber || bankAccount.swiftCode || "",
        swiftCode: bankAccount.swiftCode,
        routingNumber: bankAccount.routingNumber,
        isDefault: bankAccount.isPrimary,
        isVerified: bankAccount.isVerified,
        createdAt: bankAccount.createdAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Error creating bank account:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
