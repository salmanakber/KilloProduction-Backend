import { type NextRequest, NextResponse } from "next/server"
import { CommissionType, type Module } from "@prisma/client"
import { checkoutPlatformFeeAmount } from "@/lib/commission-service"

const MODULES: Module[] = [
  "PHARMACY",
  "GROCERY",
  "FOOD",
  "AUTO_PARTS",
  "RIDING",
  "COURIER",
  "WHOLESALER",
]

/**
 * GET /api/customer/cart/platform-fee?module=PHARMACY&amount=123.45
 * Same rules as checkout: active PLATFORM_FEE for module, else module-specific defaults.
 */
export async function GET(request: NextRequest) {
  try {
    const module = request.nextUrl.searchParams.get("module") as Module | null
    const amountRaw = request.nextUrl.searchParams.get("amount")
    const amount = Number(amountRaw)

    if (!module || !MODULES.includes(module)) {
      return NextResponse.json({ error: "Valid module is required" }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 })
    }

    const commissionAmount = await checkoutPlatformFeeAmount(module, amount)
    const commissionRate =
      amount > 0 ? Math.round((commissionAmount / amount) * 10000) / 100 : 0

    return NextResponse.json({
      success: true,
      module,
      orderAmount: amount,
      commissionType: CommissionType.PLATFORM_FEE,
      commissionAmount,
      commissionRate,
      minAmount: null,
      maxAmount: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to calculate platform fee"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
