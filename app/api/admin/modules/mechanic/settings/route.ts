import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { systemSettings } from "@/lib/systemSettings"

async function requireAdmin() {
  const session = await authenticateRequest()
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  const user = await prisma.user.findUnique({ where: { id: session.id } })
  if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) }
  }
  return { user }
}

export async function GET() {
  const gate = await requireAdmin()
  const settings = await systemSettings()
  const currencySymbol = typeof settings.currency === "string" ? settings.currency : "₦"
  if ("error" in gate && gate.error) return gate.error

  const row = await prisma.autoPartsMechanicPickupSettings.upsert({
    where: { id: 1 },
    create: { id: 1, pricePerKm: 2 },
    update: {},
  })

  return NextResponse.json({
    pickupPricePerKm: row.pricePerKm,
    updatedAt: row.updatedAt.toISOString(),
    currencySymbol,
  })
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin()
  if ("error" in gate && gate.error) return gate.error

  const body = await request.json().catch(() => ({}))
  const raw = body.pickupPricePerKm ?? body.pricePerKm
  const pricePerKm = typeof raw === "number" ? raw : Number.parseFloat(String(raw))
  if (!Number.isFinite(pricePerKm) || pricePerKm <= 0 || pricePerKm > 1_000_000) {
    return NextResponse.json(
      { error: "pickupPricePerKm must be a positive number (max 1e6)" },
      { status: 400 }
    )
  }

  const row = await prisma.autoPartsMechanicPickupSettings.upsert({
    where: { id: 1 },
    create: { id: 1, pricePerKm },
    update: { pricePerKm },
  })

  return NextResponse.json({
    success: true,
    pickupPricePerKm: row.pricePerKm,
    updatedAt: row.updatedAt.toISOString(),
  })
}
