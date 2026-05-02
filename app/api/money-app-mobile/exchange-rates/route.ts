import { NextRequest, NextResponse } from "next/server"
import { getMoneyTransferFxRate, recordFxSnapshotWhenChanged } from "@/lib/money-fx-rate"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = (searchParams.get("from") || "USD").trim().toUpperCase()
    const to = (searchParams.get("to") || "NGN").trim().toUpperCase()

    const rate = await getMoneyTransferFxRate(from, to)

    if (!rate) {
      return NextResponse.json({ error: "Failed to fetch exchange rate" }, { status: 500 })
    }

    void recordFxSnapshotWhenChanged(from, to, rate)

    return NextResponse.json({
      success: true,
      from,
      to,
      rate: rate,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("Error in exchange rate endpoint:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get exchange rate" },
      { status: 500 }
    )
  }
}
