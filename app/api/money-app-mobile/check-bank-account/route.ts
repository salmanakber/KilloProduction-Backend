import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user has at least one verified bank account
    const bankAccounts = await prisma.bankAccount.findMany({
      where: {
        userId: user.id,
        isVerified: true,
      },
      select: {
        id: true,
        accountHolderName: true,
        bankName: true,
        accountNumber: true,
        isDefault: true,
        isVerified: true,
      },
      orderBy: {
        isDefault: "desc",
      },
    })

    return NextResponse.json({
      success: true,
      hasVerifiedAccount: bankAccounts.length > 0,
      bankAccounts: bankAccounts,
      count: bankAccounts.length,
    })
  } catch (error: any) {
    console.error("Error checking bank account:", error)
    return NextResponse.json(
      { error: error.message || "Failed to check bank account" },
      { status: 500 }
    )
  }
}
