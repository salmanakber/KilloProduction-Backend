import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"

type RefundSettings = {
  enabledModules: {
    FOOD: boolean
    GROCERY: boolean
    PHARMACY: boolean
    AUTO_PARTS: boolean
    RIDING: boolean
  }
  deliveryFeeBearer: "VENDOR" | "CUSTOMER"
  refundPlatformCommission: boolean
  autoRefundThreshold?: number
  loyalCompletedOrdersMin?: number
}

const DEFAULT_SETTINGS: RefundSettings = {
  enabledModules: {
    FOOD: true,
    GROCERY: true,
    PHARMACY: true,
    AUTO_PARTS: true,
    RIDING: true,
  },
  deliveryFeeBearer: "CUSTOMER",
  refundPlatformCommission: true,
  autoRefundThreshold: 20,
  loyalCompletedOrdersMin: 50,
}

function readSettings(raw: unknown): RefundSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_SETTINGS
  const obj = raw as Record<string, unknown>
  const enabled = (obj.enabledModules ?? {}) as Record<string, unknown>
  return {
    enabledModules: {
      FOOD: enabled.FOOD !== false,
      GROCERY: enabled.GROCERY !== false,
      PHARMACY: enabled.PHARMACY !== false,
      AUTO_PARTS: enabled.AUTO_PARTS !== false,
      RIDING: enabled.RIDING !== false,
    },
    deliveryFeeBearer: obj.deliveryFeeBearer === "VENDOR" ? "VENDOR" : "CUSTOMER",
    refundPlatformCommission: obj.refundPlatformCommission !== false,
    autoRefundThreshold:
      typeof obj.autoRefundThreshold === "number" && Number.isFinite(obj.autoRefundThreshold)
        ? obj.autoRefundThreshold
        : 20,
    loyalCompletedOrdersMin:
      typeof obj.loyalCompletedOrdersMin === "number" && Number.isFinite(obj.loyalCompletedOrdersMin)
        ? obj.loyalCompletedOrdersMin
        : 50,
  }
}

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const row = await prisma.systemSettings.findFirst({ select: { compnyinfo: true } })
    const comp =
      row?.compnyinfo && typeof row.compnyinfo === "object" && !Array.isArray(row.compnyinfo)
        ? (row.compnyinfo as Record<string, unknown>)
        : {}
    const settings = readSettings(comp.refundSettings)
    return NextResponse.json({ settings })
  } catch (e) {
    console.error("refund settings GET:", e)
    return NextResponse.json({ error: "Failed to load refund settings" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error
  try {
    const body = await request.json()
    const settings = readSettings(body?.settings)
    const row = await prisma.systemSettings.findFirst({ select: { id: true, compnyinfo: true } })
    const comp =
      row?.compnyinfo && typeof row.compnyinfo === "object" && !Array.isArray(row.compnyinfo)
        ? (row.compnyinfo as Record<string, unknown>)
        : {}
    const nextComp = { ...comp, refundSettings: settings }
    await prisma.systemSettings.upsert({
      where: { id: row?.id ?? 1 },
      update: { compnyinfo: nextComp },
      create: { id: row?.id ?? 1, appName: "Kilo Super App", compnyinfo: nextComp },
    })
    return NextResponse.json({ success: true, settings })
  } catch (e) {
    console.error("refund settings PUT:", e)
    return NextResponse.json({ error: "Failed to save refund settings" }, { status: 500 })
  }
}
