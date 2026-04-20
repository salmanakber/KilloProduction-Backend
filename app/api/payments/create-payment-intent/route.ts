import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { createPaymentIntent } from "@/lib/payment-gateway"
import { prisma } from "@/lib/prisma"
import { resolvePendingCheckoutPayment } from "@/lib/pending-checkout-payment"

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { amount, currency, gateway, orderId, description, customerEmail, metadata } = body

    if (!amount || !currency || !gateway || !orderId || !description || !customerEmail) {
      return NextResponse.json({
        error: "Missing required fields: amount, currency, gateway, orderId, description, customerEmail",
      }, { status: 400 })
    }

    const clientRef = String(orderId)
    const metaIn =
      metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {}

    const paymentRow = await resolvePendingCheckoutPayment({
      userId: session.id,
      clientRef,
      amount: Number(amount),
      currency: String(currency),
      gateway: String(gateway),
      description,
      baseMetadata: {
        ...metaIn,
        userId: session.id,
        createdAt: new Date().toISOString(),
      },
    })

    const prev = (paymentRow.metadata as Record<string, unknown> | null) || {}
    const mergedMeta: Record<string, unknown> = {
      ...prev,
      ...metaIn,
      userId: session.id,
      createdAt: new Date().toISOString(),
      paymentProcessingFee: prev.paymentProcessingFee ?? metaIn.paymentProcessingFee,
      paymentProcessingRate: prev.paymentProcessingRate ?? metaIn.paymentProcessingRate,
      baseAmount: prev.baseAmount ?? metaIn.baseAmount,
      module: prev.module ?? metaIn.module,
    }

    if (Math.abs(Number(amount) - paymentRow.amount) > 0.02) {
      return NextResponse.json(
        { error: "Amount does not match pending payment record" },
        { status: 400 }
      )
    }
    if (paymentRow.currency.toUpperCase() !== String(currency).toUpperCase()) {
      return NextResponse.json({ error: "Currency does not match pending payment record" }, { status: 400 })
    }

    await prisma.payment.update({
      where: { id: paymentRow.id },
      data: {
        gateway,
        metadata: mergedMeta as object,
      },
    })

    const prismaPaymentId = paymentRow.id

    const paymentIntent = await createPaymentIntent({
      amount,
      currency,
      gateway,
      orderId: prismaPaymentId,
      description,
      customerEmail,
      metadata: mergedMeta,
    })

    return NextResponse.json({
      success: true,
      data: {
        ...paymentIntent,
        prismaPaymentId,
      },
    })
  } catch (error: any) {
    console.error("Payment intent creation error:", error)
    return NextResponse.json({
      error: error.message || "Failed to create payment intent",
    }, { status: 500 })
  }
}
