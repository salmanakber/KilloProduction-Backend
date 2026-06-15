import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { createWalletTopUp } from "@/lib/money-wallet-topup"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const amount = Number(body.amount)
    const currency = String(body.currency || "NGN")
    const paymentMethod =
      String(body.paymentMethod || body.method || "CARD").toUpperCase() === "BANK"
        ? ("BANK" as const)
        : ("CARD" as const)
    const savedPaymentMethodId = body.savedPaymentMethodId
      ? String(body.savedPaymentMethodId)
      : undefined
    const preferInlineStripe = Boolean(body.preferInlineStripe)
    const saveCard = Boolean(body.saveCard)

    const result = await createWalletTopUp({
      userId: user.id,
      email: user.email || "",
      amount,
      currency,
      paymentMethod,
      savedPaymentMethodId,
      preferInlineStripe,
      saveCard,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Top-up failed"
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
