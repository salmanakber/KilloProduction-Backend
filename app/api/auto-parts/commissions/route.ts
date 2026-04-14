import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

function settingPayload(setting: {
  rate: number
  minAmount: number | null
  maxAmount: number | null
  description: string | null
  commissionType: string
}) {
  return {
    commissionType: setting.commissionType,
    rate: setting.rate,
    minAmount: setting.minAmount,
    maxAmount: setting.maxAmount,
    description: setting.description,
  }
}

/**
 * GET /api/auto-parts/commissions
 * - Default (no query): legacy shape with fallback defaults for carts / quotes.
 * - ?mode=receipt: only active rows from DB — used for customer order receipt lines (no invented rates).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const mode = new URL(request.url).searchParams.get("mode")

    if (mode === "receipt") {
      const rows = await prisma.commissionSetting.findMany({
        where: { module: "AUTO_PARTS", isActive: true },
      })
      const pick = (t: string) => rows.find((r) => r.commissionType === t)
      const pf = pick("PLATFORM_FEE")
      const rc = pick("RIDER_COMMISSION")
      return NextResponse.json({
        // AUTO_PARTS customer checkout does not charge CUSTOMER_TAX (platform fee + line items + mechanic + pickup only)
        customerTax: null,
        platformFee: pf ? settingPayload(pf) : null,
        riderCommission: rc ? settingPayload(rc) : null,
      })
    }

    const commissionSettings = await prisma.commissionSetting.findMany({
      where: {
        module: "AUTO_PARTS",
        isActive: true,
      },
    })

    const commissions: Record<string, { rate: number; minAmount: number | null; maxAmount: number | null }> = {}
    commissionSettings.forEach((setting) => {
      commissions[setting.commissionType] = {
        rate: setting.rate,
        minAmount: setting.minAmount,
        maxAmount: setting.maxAmount,
      }
    })

    return NextResponse.json({
      platformFee: commissions.PLATFORM_FEE || { rate: 3.0, minAmount: null, maxAmount: null },
      vendorCommission: commissions.VENDOR_COMMISSION || { rate: 5.0, minAmount: null, maxAmount: null },
      mechanicCommission: commissions.MECHANIC_COMMISSION || { rate: 5.0, minAmount: null, maxAmount: null },
      customerTax: commissions.CUSTOMER_TAX || { rate: 0, minAmount: null, maxAmount: null },
      mechanicTax: commissions.MECHANIC_TAX || { rate: 0, minAmount: null, maxAmount: null },
    })
  } catch (error) {
    console.error("Commission settings fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch commission settings" }, { status: 500 })
  }
}

