import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getPrimaryAndFallbackGateways } from "@/lib/payment-gateway"

const ALLOWED = new Set(["STRIPE", "PAYSTACK"])

/**
 * GET — resolved primary/fallback (for checkout) + raw stored `primaryGateway` in paymentMethods JSON.
 */
export async function GET() {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } })
    const currency = settings?.defaultCurrency || settings?.currency || "NGN"

    const { primary, fallback, gateways } = await getPrimaryAndFallbackGateways(currency)

    const pm =
      settings?.paymentMethods && typeof settings.paymentMethods === "object"
        ? (settings.paymentMethods as Record<string, unknown>)
        : {}
    const storedRaw = pm.primaryGateway ?? pm.primary
    const storedPrimary =
      typeof storedRaw === "string" ? storedRaw.toUpperCase() : null

    return NextResponse.json({
      currency,
      /** Effective primary used by mobile/API (after env + keys + stored preference). */
      primaryGateway: primary,
      /** Other configured gateway used as automatic fallback when primary fails. */
      fallbackGateway: fallback,
      /** Value persisted in system_settings.paymentMethods (may differ until keys exist). */
      storedPrimaryGateway: storedPrimary,
      configuredGatewayIds: gateways.map((g: { id: string }) => g.id),
      gateways,
    })
  } catch (error) {
    console.error("admin payment-gateway GET:", error)
    return NextResponse.json({ error: "Failed to load payment gateway settings" }, { status: 500 })
  }
}

/**
 * PUT — set `primaryGateway` inside system_settings.paymentMethods (merged with existing JSON).
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const raw = body.primaryGateway ?? body.primary
    if (typeof raw !== "string" || !raw.trim()) {
      return NextResponse.json({ error: "primaryGateway is required" }, { status: 400 })
    }

    const primaryGateway = raw.trim().toUpperCase()
    if (!ALLOWED.has(primaryGateway)) {
      return NextResponse.json(
        { error: `primaryGateway must be one of: ${[...ALLOWED].join(", ")}` },
        { status: 400 }
      )
    }

    const existing = await prisma.systemSettings.findUnique({ where: { id: 1 } })
    const prev =
      existing?.paymentMethods && typeof existing.paymentMethods === "object"
        ? (existing.paymentMethods as Record<string, unknown>)
        : {}

    const paymentMethods = {
      ...prev,
      primaryGateway,
    }

    const row = await prisma.systemSettings.findUnique({ where: { id: 1 } })
    if (row) {
      await prisma.systemSettings.update({
        where: { id: 1 },
        data: { paymentMethods },
      })
    } else {
      await prisma.systemSettings.create({
        data: {
          id: 1,
          paymentMethods,
        },
      })
    }

    const currency = existing?.defaultCurrency || existing?.currency || "NGN"
    const { primary, fallback, gateways } = await getPrimaryAndFallbackGateways(currency)

    await prisma.auditLog.create({
      data: {
        performedBy: user.id,
        action: "UPDATE_PAYMENT_GATEWAY_PRIMARY",
        entityType: "SYSTEM_SETTINGS",
        entityId: "1",
        details: { primaryGateway, resolvedPrimary: primary, fallbackGateway: fallback },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Primary payment gateway updated",
      primaryGateway: primary,
      fallbackGateway: fallback,
      storedPrimaryGateway: primaryGateway,
      configuredGatewayIds: gateways.map((g: { id: string }) => g.id),
    })
  } catch (error) {
    console.error("admin payment-gateway PUT:", error)
    return NextResponse.json({ error: "Failed to save payment gateway settings" }, { status: 500 })
  }
}
