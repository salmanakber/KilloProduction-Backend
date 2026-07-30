import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { manualContributeToAjo } from "@/lib/ajo-service"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const cycleId = typeof body.cycleId === "string" ? body.cycleId : undefined
    const transferPinToken =
      typeof body.transferPinToken === "string" ? body.transferPinToken : undefined

    try {
      const result = await manualContributeToAjo(params.id, user.id, {
        cycleId,
        transferPinToken,
      })
      return NextResponse.json({ ...result, success: true })
    } catch (e: unknown) {
      const err = e as Error & { code?: string }
      if (err.code === "INSUFFICIENT_BALANCE" || err.message?.includes("Insufficient")) {
        return NextResponse.json(
          {
            error: err.message,
            code: "INSUFFICIENT_BALANCE",
            action: "topup",
          },
          { status: 402 },
        )
      }
      if (err.message?.includes("PIN")) {
        return NextResponse.json({ error: err.message, code: "PIN_REQUIRED" }, { status: 403 })
      }
      throw e
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    console.error("ajo/groups/[id]/contribute POST:", e)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
