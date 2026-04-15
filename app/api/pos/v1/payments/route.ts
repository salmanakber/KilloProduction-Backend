import { type NextRequest, NextResponse } from "next/server"
import { authenticatePosRequest } from "@/lib/pos-integration-auth"

/**
 * Payment intents / capture — hook into your existing gateway here.
 */
export async function GET(request: NextRequest) {
  const ctx = await authenticatePosRequest(request, "payments:read")
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  return NextResponse.json({
    message: "List payment events for this store — extend with Payment / Transaction queries as needed.",
    integrationId: ctx.integration.id,
  })
}

export async function POST(_request: NextRequest) {
  const ctx = await authenticatePosRequest(request, "payments:read")
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  return NextResponse.json(
    {
      error: "not_implemented",
      message:
        "Wire this to your payment provider (e.g. record webhook, create Payment row). Customer app checkout already uses /api/payments/* — mirror that flow for POS-initiated charges if required.",
    },
    { status: 501 }
  )
}
