import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

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

    // Transform to match GlobalBankScreen interface
    const transformed = bankAccounts.map((acc) => ({
      id: acc.id,
      accountName: acc.accountHolderName,
      accountNumber: acc.accountNumber,
      bankName: acc.bankName,
      bankCode: acc.routingNumber || acc.swiftCode || "",
      swiftCode: acc.swiftCode,
      routingNumber: acc.routingNumber,
      isDefault: acc.isDefault,
      isVerified: acc.isVerified, // Must be verified by admin for money transfer
      createdAt: acc.createdAt.toISOString(),
    }))

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
    } = body

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
        isDefault: isDefault || false,
        isVerified: false, // Must be verified by admin for money transfer
      },
    })

    // Transform response
    return NextResponse.json(
      {
        id: bankAccount.id,
        accountName: bankAccount.accountHolderName,
        accountNumber: bankAccount.accountNumber,
        bankName: bankAccount.bankName,
        bankCode: bankAccount.routingNumber || bankAccount.swiftCode || "",
        swiftCode: bankAccount.swiftCode,
        routingNumber: bankAccount.routingNumber,
        isDefault: bankAccount.isDefault,
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
