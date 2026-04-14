import { type NextRequest, NextResponse } from "next/server"
import { getPrimaryAndFallbackGateways } from "@/lib/payment-gateway"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const currency = searchParams.get("currency") || "NGN"

    const { primary, fallback, gateways } = await getPrimaryAndFallbackGateways(currency)

    return NextResponse.json({
      gateways,
      primaryGateway: primary,
      fallbackGateway: fallback,
      defaultCurrency: currency,
    })
  } catch (error) {
    console.error("Payment gateways fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch payment gateways" }, { status: 500 })
  }
}