import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accounts = await prisma.bankAccount.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        accountHolderName: true,
        bankName: true,
        accountNumber: true,
        accountType: true,
        isDefault: true,
        isVerified: true,
        routingNumber: true,
        swiftCode: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ success: true, accounts })
  } catch (e: any) {
    console.error("bank-accounts:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
