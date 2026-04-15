import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticatePosRequest } from "@/lib/pos-integration-auth"

export async function GET(request: NextRequest) {
  const ctx = await authenticatePosRequest(request, "settings:read")
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const row = await prisma.posIntegration.findUnique({
    where: { id: ctx.integration.id },
    select: {
      id: true,
      name: true,
      module: true,
      providerSlug: true,
      isActive: true,
      settings: true,
      restaurantId: true,
      groceryStoreId: true,
      updatedAt: true,
    },
  })
  return NextResponse.json({ integration: row })
}

export async function PATCH(request: NextRequest) {
  const ctx = await authenticatePosRequest(request, "settings:write")
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const settings = body.settings
  if (settings === undefined) {
    return NextResponse.json({ error: "settings object required" }, { status: 400 })
  }

  const updated = await prisma.posIntegration.update({
    where: { id: ctx.integration.id },
    data: {
      settings,
      ...(typeof body.name === "string" && { name: body.name.trim() }),
    },
    select: { id: true, name: true, settings: true, updatedAt: true },
  })
  return NextResponse.json({ integration: updated })
}
