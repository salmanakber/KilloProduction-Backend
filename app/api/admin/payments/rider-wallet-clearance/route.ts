import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

function clampDays(n: number): number {
  if (!Number.isFinite(n)) return 4
  return Math.min(14, Math.max(1, Math.floor(n)))
}

export async function GET() {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const row = await prisma.systemSettings.findFirst({
      select: { riderWalletClearanceDays: true },
    })
    return NextResponse.json({
      riderWalletClearanceDays: clampDays(row?.riderWalletClearanceDays ?? 4),
    })
  } catch (e) {
    console.error("rider-wallet-clearance GET", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await request.json()
    const days = clampDays(Number(body?.riderWalletClearanceDays ?? body?.days))

    await prisma.systemSettings.upsert({
      where: { id: 1 },
      update: { riderWalletClearanceDays: days },
      create: {
        id: 1,
        riderWalletClearanceDays: days,
        appName: "Kilo Super App",
      },
    })

    return NextResponse.json({ success: true, riderWalletClearanceDays: days })
  } catch (e) {
    console.error("rider-wallet-clearance PUT", e)
    return NextResponse.json({ error: "Failed to save" }, { status: 500 })
  }
}
