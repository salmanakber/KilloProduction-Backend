import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { invalidateRiderPeakBonusSettingsCache } from "@/lib/rider-peak-bonus-settings"
import { invalidateAutomationAiSettingsCache } from "@/lib/automation-ai-settings"

async function assertAdmin() {
  const session = await authenticateRequest()
  if (!session?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  const user = await prisma.user.findUnique({ where: { id: session.id } })
  if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) }
  }
  return {}
}

export async function GET() {
  try {
    const gate = await assertAdmin()
    if (gate.error) return gate.error

    const row = await prisma.systemSettings.findFirst({
      select: {
        riderPeakBonusDemandThreshold: true,
        riderPeakBonusWindowMinutes: true,
        riderPeakBonusMinTargetRides: true,
        riderPeakBonusMaxTargetRides: true,
        riderPeakBonusTargetBase: true,
        riderPeakBonusTargetPeakScale: true,
        riderPeakBonusBonusProfitShare: true,
        riderPeakBonusCommissionPeakFactor: true,
        riderPeakBonusBaselineUtilPerHour: true,
        riderPeakBonusExpectedUtilPerHour: true,
        riderBonusAiEnabled: true,
      },
    })

    return NextResponse.json({
      settings: row ?? {},
    })
  } catch (e) {
    console.error("[admin/rider/bonus-settings GET]", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

export async function PATCH(request: NextRequest) {
  try {
    const gate = await assertAdmin()
    if (gate.error) return gate.error

    const body = await request.json().catch(() => ({}))

    await prisma.systemSettings.update({
      where: { id: 1 },
      data: {
        riderPeakBonusDemandThreshold: num(body.riderPeakBonusDemandThreshold, 1.2),
        riderPeakBonusWindowMinutes: Math.round(num(body.riderPeakBonusWindowMinutes, 90)),
        riderPeakBonusMinTargetRides: Math.round(num(body.riderPeakBonusMinTargetRides, 2)),
        riderPeakBonusMaxTargetRides: Math.round(num(body.riderPeakBonusMaxTargetRides, 12)),
        riderPeakBonusTargetBase: num(body.riderPeakBonusTargetBase, 2),
        riderPeakBonusTargetPeakScale: num(body.riderPeakBonusTargetPeakScale, 2),
        riderPeakBonusBonusProfitShare: num(body.riderPeakBonusBonusProfitShare, 0.7),
        riderPeakBonusCommissionPeakFactor: num(body.riderPeakBonusCommissionPeakFactor, 25),
        riderPeakBonusBaselineUtilPerHour: num(body.riderPeakBonusBaselineUtilPerHour, 0.35),
        riderPeakBonusExpectedUtilPerHour: num(body.riderPeakBonusExpectedUtilPerHour, 0.9),
        ...(typeof body.riderBonusAiEnabled === "boolean" ? { riderBonusAiEnabled: body.riderBonusAiEnabled } : {}),
      },
    })

    invalidateRiderPeakBonusSettingsCache()
    invalidateAutomationAiSettingsCache()

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[admin/rider/bonus-settings PATCH]", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
