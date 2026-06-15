import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { purchaseVtpassService } from "@/lib/vtpass-purchase"
import {
  MoneyRiskBlocked,
  MoneyRiskStepUpRequired,
} from "@/lib/money-transfer-risk"
import type { VtpassServiceType } from "@/lib/vtpass"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const serviceType = body.serviceType as VtpassServiceType
    const serviceId = body.serviceId as string
    const billersCode = String(body.billersCode || body.phone || "").trim()
    const amount = Number(body.amount)
    const phone = body.phone ? String(body.phone).trim() : undefined
    const variationCode = body.variationCode as string | undefined
    const extraFields = body.extraFields as Record<string, string> | undefined

    if (!serviceType || !serviceId || !billersCode || !Number.isFinite(amount)) {
      return NextResponse.json({ error: "Invalid payment details" }, { status: 400 })
    }

    const allowedTypes = ["airtime", "data", "electricity", "cable", "education", "insurance"] as const
    if (!allowedTypes.includes(serviceType)) {
      return NextResponse.json({ error: "Invalid service type" }, { status: 400 })
    }

    const result = await purchaseVtpassService({
      userId: user.id,
      request,
      body,
      serviceType,
      serviceId,
      billersCode,
      amount,
      phone,
      variationCode,
      extraFields,
    })

    return NextResponse.json({
      success: true,
      transaction: result.transaction,
      walletBalance: result.walletBalance,
    })
  } catch (e: unknown) {
    if (e instanceof MoneyRiskBlocked) {
      return NextResponse.json({ error: e.message, blocked: true, code: e.code }, { status: 403 })
    }
    if (e instanceof MoneyRiskStepUpRequired) {
      return NextResponse.json(
        { error: e.message, requiresStepUp: true, code: e.code },
        { status: 403 },
      )
    }
    const message = e instanceof Error ? e.message : "Payment failed"
    console.error("Payment failed", message)
    console.error("Payment failed", e)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
