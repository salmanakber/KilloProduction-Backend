import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = verifyToken(token)
    const userId = decoded.userId

    const bankAccounts = await prisma.vendorBankAccount.findMany({
      where: { vendorId: userId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    })

    return NextResponse.json(bankAccounts)
  } catch (error) {
    console.error("Error fetching bank accounts:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = verifyToken(token)
    const userId = decoded.userId

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
    } = await request.json()

    if (!bankName || !accountNumber || !accountName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // If setting as primary, update existing primary accounts
    if (isPrimary) {
      await prisma.vendorBankAccount.updateMany({
        where: { vendorId: userId, isPrimary: true },
        data: { isPrimary: false },
      })
    }

    const bankAccount = await prisma.vendorBankAccount.create({
      data: {
        vendorId: userId,
        bankName,
        accountNumber,
        accountName,
        routingNumber,
        swiftCode,
        branchCode,
        accountType: accountType || "checking",
        currency: currency || "USD",
        isPrimary: isPrimary || false,
        verificationStatus: "PENDING",
      },
    })

    return NextResponse.json(bankAccount, { status: 201 })
  } catch (error) {
    console.error("Error creating bank account:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
