import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(50, parseInt(searchParams.get("limit") || "30", 10))

    const rows = await prisma.moneyWalletWithdrawal.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    return NextResponse.json({
      success: true,
      withdrawals: rows.map((w) => ({
        id: w.id,
        amount: w.amount,
        currency: w.currency,
        status: w.status,
        bankName: w.bankName,
        accountNumberMasked: `••••${w.accountNumber.slice(-4)}`,
        paystackReference: w.paystackReference,
        failureReason: w.failureReason,
        scheduledProcessAt: w.scheduledProcessAt,
        createdAt: w.createdAt,
        completedAt: w.completedAt,
        failedAt: w.failedAt,
      })),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load withdrawals"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
