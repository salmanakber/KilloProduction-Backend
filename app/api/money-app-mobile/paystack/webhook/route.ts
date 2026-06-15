import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { completeWalletTopUpFromPaystackReference } from "@/lib/money-wallet-topup"

async function getPaystackSecret(): Promise<string | null> {
  const config = await prisma.moneyTransferConfig.findFirst({ select: { paystackSecretKey: true } })
  return (
    config?.paystackSecretKey ||
    process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET_KEY ||
    null
  )
}

function verifyPaystackSignature(body: string, signature: string, secret: string): boolean {
  const hash = crypto.createHmac("sha512", secret).update(body).digest("hex")
  return hash === signature
}

export async function POST(request: NextRequest) {
  try {
    const secret = await getPaystackSecret()
    if (!secret) {
      return NextResponse.json({ error: "Paystack not configured" }, { status: 500 })
    }

    const body = await request.text()
    const signature = request.headers.get("x-paystack-signature")
    if (!signature || !verifyPaystackSignature(body, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const event = JSON.parse(body) as {
      event?: string
      data?: {
        reference?: string
        status?: string
        metadata?: Record<string, unknown>
        channel?: string
      }
    }

    const reference = event.data?.reference
    if (!reference) {
      return NextResponse.json({ received: true })
    }

    const meta = event.data?.metadata || {}
    const isWalletTopUp =
      meta.type === "WALLET_TOPUP" ||
      String(reference).startsWith("TOPUP_")

    if (
      isWalletTopUp &&
      (event.event === "charge.success" || event.data?.status === "success")
    ) {
      await completeWalletTopUpFromPaystackReference(reference)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("money paystack webhook:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook failed" },
      { status: 500 },
    )
  }
}
