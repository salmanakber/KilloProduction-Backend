import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const row = await prisma.systemSettings.findFirst({ select: { compnyinfo: true } })
    const comp =
      row?.compnyinfo && typeof row.compnyinfo === "object" && !Array.isArray(row.compnyinfo)
        ? (row.compnyinfo as Record<string, unknown>)
        : {}
    const settings =
      comp.refundSettings && typeof comp.refundSettings === "object" && !Array.isArray(comp.refundSettings)
        ? (comp.refundSettings as Record<string, unknown>)
        : {}
    const enabledModules =
      settings.enabledModules && typeof settings.enabledModules === "object" && !Array.isArray(settings.enabledModules)
        ? (settings.enabledModules as Record<string, unknown>)
        : { FOOD: true, GROCERY: true, PHARMACY: true, AUTO_PARTS: true, RIDING: true }
    const deliveryFeeBearer = settings.deliveryFeeBearer === "VENDOR" ? "VENDOR" : "CUSTOMER"
    const refundPlatformCommission = settings.refundPlatformCommission !== false
    return NextResponse.json({ enabledModules, deliveryFeeBearer, refundPlatformCommission })
  } catch (e) {
    console.error("refund settings public GET:", e)
    return NextResponse.json({ error: "Failed to load refund settings" }, { status: 500 })
  }
}
