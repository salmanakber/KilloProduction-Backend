import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { acceptCreditOffer } from "@/lib/credit-centre-service"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const offerId = typeof body.offerId === "string" ? body.offerId : ""
    const amount = Number(body.amount)
    if (!offerId) {
      return NextResponse.json({ error: "offerId is required" }, { status: 400 })
    }
    try {
      const result = await acceptCreditOffer({
        userId: user.id,
        offerId,
        amount,
      })
      return NextResponse.json({ ...result, success: true })
    } catch (e: unknown) {
      const err = e as Error
      if (err.message?.includes("Insufficient")) {
        return NextResponse.json(
          { error: err.message, code: "INSUFFICIENT_BALANCE" },
          { status: 402 },
        )
      }
      throw e
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
