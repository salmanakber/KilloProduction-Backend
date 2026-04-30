import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

async function verifyPaystack(secretKey: string, reference: string) {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  const payload = await response.json()
  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || "Failed to verify Paystack transaction")
  }
  return payload.data
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { transferId, gateway, reference, paymentIntentId } = await request.json()
    if (!transferId || !gateway) {
      return NextResponse.json({ error: "transferId and gateway are required." }, { status: 400 })
    }

    const transfer = await prisma.moneyTransfer.findUnique({ where: { id: transferId } })
    if (!transfer) return NextResponse.json({ error: "Transfer not found." }, { status: 404 })
    if (transfer.senderId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const gatewayName = String(gateway).toUpperCase()
    let paid = false

    if (gatewayName === "STRIPE") {
      const config = await prisma.moneyTransferConfig.findFirst()
      const secret = config?.stripeSecretKey || process.env.MONEY_TRANSFER_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY
      if (!secret) return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 })
      const stripe = new Stripe(secret, { apiVersion: "2023-10-16" })
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId || transfer.stripePaymentIntentId || "")
      paid = intent.status === "succeeded"
    } else if (gatewayName === "PAYSTACK") {
      const config = await prisma.moneyTransferConfig.findFirst()
      if (!config?.paystackSecretKey) {
        return NextResponse.json({ error: "Paystack is not configured." }, { status: 500 })
      }
      const result = await verifyPaystack(config.paystackSecretKey, reference || transfer.reference)
      paid = result?.status === "success"
    } else {
      return NextResponse.json({ error: "Unsupported gateway." }, { status: 400 })
    }

    await prisma.moneyTransfer.update({
      where: { id: transfer.id },
      data: paid
        ? {
            status: "SENT",
            sentAt: new Date(),
            metadata: {
              ...(transfer.metadata as object),
              paymentGateway: gatewayName,
              paymentReference: reference || paymentIntentId || transfer.reference,
            },
          }
        : {
            status: "FAILED",
            failedAt: new Date(),
          },
    })

    return NextResponse.json({ success: true, paid, transferId: transfer.id })
  } catch (error: any) {
    console.error("Error confirming money transfer payment:", error)
    return NextResponse.json({ error: error.message || "Failed to confirm transfer payment" }, { status: 500 })
  }
}
