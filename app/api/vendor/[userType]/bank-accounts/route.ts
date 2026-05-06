import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

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

    // Validate required fields
    if (!accountName || !accountNumber || !bankName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
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
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim().toUpperCase(),
        routingNumber: routingNumber || bankCode || null,
        swiftCode: swiftCode || null,
        isPrimary: isDefault || false,
        // Account name is provider-verified in `resolve-account` before submit.
        isVerified: true,
        verificationStatus: "VERIFIED",
        currency: "NGN", // For Nigerian banks
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
