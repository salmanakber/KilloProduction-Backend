import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { repayCreditLoan } from "@/lib/credit-centre-service"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const loanId = typeof body.loanId === "string" ? body.loanId : ""
    const amount = body.amount != null ? Number(body.amount) : undefined
    if (!loanId) {
      return NextResponse.json({ error: "loanId is required" }, { status: 400 })
    }
    try {
      const result = await repayCreditLoan({
        userId: user.id,
        loanId,
        amount,
      })
      return NextResponse.json({ ...result, success: true })
    } catch (e: unknown) {
      const err = e as Error
      if (err.message?.includes("Insufficient")) {
        return NextResponse.json(
          {
            error: err.message,
            code: "INSUFFICIENT_BALANCE",
            action: "topup",
          },
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
