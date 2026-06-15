import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import {
  getPendingBankTopUp,
  listPendingBankTopUps,
} from "@/lib/money-wallet-topup"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    const limit = parseInt(searchParams.get("limit") || "10", 10)

    if (id) {
      const item = await getPendingBankTopUp(user.id, id)
      if (!item) {
        return NextResponse.json({ error: "Pending deposit not found" }, { status: 404 })
      }
      return NextResponse.json({ success: true, pending: item })
    }

    const pending = await listPendingBankTopUps(user.id, limit)
    return NextResponse.json({ success: true, pending, count: pending.length })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load pending deposits"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
