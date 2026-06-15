import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { computeWalletConvertQuote } from "@/lib/money-wallet-convert"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const amount = parseFloat(searchParams.get("amount") || "")
    const fromCurrency = (searchParams.get("fromCurrency") || searchParams.get("from") || "")
      .trim()
      .toUpperCase()
      .slice(0, 3)
    const toCurrency = (searchParams.get("toCurrency") || searchParams.get("to") || "")
      .trim()
      .toUpperCase()
      .slice(0, 3)

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 })
    }
    if (!fromCurrency || !toCurrency) {
      return NextResponse.json({ error: "fromCurrency and toCurrency are required" }, { status: 400 })
    }

    const quote = await computeWalletConvertQuote({
      fromAmount: amount,
      fromCurrency,
      toCurrency,
    })

    return NextResponse.json({ success: true, quote })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to compute quote"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
