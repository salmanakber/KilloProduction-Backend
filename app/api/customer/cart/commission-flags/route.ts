import { type NextRequest, NextResponse } from "next/server"
import { CommissionType, type Module } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { calculateCommission } from "@/lib/commission-service"
const MODULES: Module[] = [
  "PHARMACY",
  "GROCERY",
  "FOOD",
  "AUTO_PARTS",
  "RIDING",
  "COURIER",
  "WHOLESALER",
  "CUSTOMER",
  "WALLET",
]

/**
 * GET /api/customer/cart/commission-flags?module=PHARMACY
 * Exposes which optional commission types are active (e.g. PAYMENT_PROCESSING) for checkout UI.
 */
export async function GET(request: NextRequest) {
  try {
    const module = request.nextUrl.searchParams.get("module") as Module | null
    const amount = request.nextUrl.searchParams.get("amount")
    if (!module || !MODULES.includes(module)) {
      return NextResponse.json({ error: "Valid module is required" }, { status: 400 })
    }

    const paymentProcessing = await prisma.commissionSetting.findFirst({
      where: {
        module,
        commissionType: CommissionType.PAYMENT_PROCESSING,
        isActive: true,
      },
    })

    let paymentProcessingAmount = 0
    let paymentProcessingRate = 0
    if (module && paymentProcessing && amount != null && Number(amount) > 0) {
      const calc = await calculateCommission(module, Number(amount), CommissionType.PAYMENT_PROCESSING)
      paymentProcessingAmount = calc.commissionAmount
      paymentProcessingRate = calc.commissionRate
    }

    return NextResponse.json({
      paymentProcessingActive: Boolean(paymentProcessing),
      paymentProcessingAmount,
      paymentProcessingRate,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load commission flags"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
