import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)

    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const bankAccounts = await prisma.vendorBankAccount.findMany({
      where: {
        vendorId: session.id, // Using rider id as vendorId
      },
      orderBy: [
        { isPrimary: "desc" },
        { createdAt: "desc" },
      ],
    })

    return NextResponse.json(bankAccounts)
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

    const body = await request.json()
    const {
      bankName,
      accountNumber,
      accountName,
      routingNumber,
      swiftCode,
      branchCode,
      accountType,
      currency,
      isPrimary,
    } = body

    // Validation
    if (!bankName || !accountNumber || !accountName) {
      return NextResponse.json(
        { error: "Bank name, account number, and account name are required" },
        { status: 400 }
      )
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
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
        routingNumber: routingNumber?.trim() || null,
        swiftCode: swiftCode?.trim() || null,
        branchCode: branchCode?.trim() || null,
        accountType: accountType || "checking",
        currency: currency || "NGN",
        isPrimary: isPrimary || false,
        isVerified: false,
        verificationStatus: "PENDING",
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




