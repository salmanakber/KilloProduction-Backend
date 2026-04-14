import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { accountId, isVerified } = await request.json()

    if (!accountId || typeof isVerified !== "boolean") {
      return NextResponse.json(
        { error: "Account ID and verification status are required" },
        { status: 400 }
      )
    }

    // Update bank account verification status
    const bankAccount = await prisma.bankAccount.update({
      where: { id: accountId },
      data: { isVerified },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    // Create notification for user
    await prisma.notification.create({
      data: {
        userId: bankAccount.userId,
        title: isVerified ? "Bank Account Verified" : "Bank Account Verification Removed",
        message: isVerified
          ? `Your bank account ending in ${bankAccount.accountNumber.slice(-4)} has been verified. You can now receive money transfers.`
          : `Your bank account verification has been removed. Please contact support for more information.`,
        type: "MONEY_TRANSFER",
        data: {
          accountId: bankAccount.id,
          isVerified,
        },
      },
    })

    return NextResponse.json({
      success: true,
      bankAccount: {
        id: bankAccount.id,
        isVerified: bankAccount.isVerified,
        accountNumber: bankAccount.accountNumber,
        accountHolderName: bankAccount.accountHolderName,
      },
    })
  } catch (error: any) {
    console.error("Error updating bank account verification:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update verification" },
      { status: 500 }
    )
  }
}
