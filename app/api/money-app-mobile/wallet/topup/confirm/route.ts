import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { confirmWalletTopUp } from "@/lib/money-wallet-topup"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { walletTransactionId, gateway, reference, paymentIntentId } = body

    if (!walletTransactionId || !gateway) {
      return NextResponse.json(
        { error: "walletTransactionId and gateway are required" },
        { status: 400 },
      )
    }

    const result = await confirmWalletTopUp({
      userId: user.id,
      walletTransactionId,
      gateway: String(gateway).toUpperCase() as "PAYSTACK" | "STRIPE",
      reference,
      paymentIntentId,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Confirmation failed"
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
