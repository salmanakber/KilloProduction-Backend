import { type NextRequest, NextResponse } from "next/server"
import { PosIntegrationModule } from "@prisma/client"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { defaultPosScopes, generatePosApiSecret, fingerprintPosToken, tokenPrefixFromSecret } from "@/lib/pos-token"

/**
 * GET — list POS integrations for the authenticated vendor (food / grocery stores they own).
 * POST — create integration + first API credential; returns secret **once** in `apiSecret`.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [restaurants, stores] = await Promise.all([
      prisma.restaurant.findMany({ where: { userId: user.id }, select: { id: true } }),
      prisma.groceryStore.findMany({ where: { userId: user.id }, select: { id: true } }),
    ])
    const rids = restaurants.map((r) => r.id)
    const gids = stores.map((g) => g.id)

    const rows = await prisma.posIntegration.findMany({
      where: {
        OR: [{ restaurantId: { in: rids } }, { groceryStoreId: { in: gids } }],
      },
      include: {
        credentials: {
          where: { revokedAt: null },
          select: {
            id: true,
            tokenPrefix: true,
            label: true,
            scopes: true,
            lastUsedAt: true,
            createdAt: true,
            expiresAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ integrations: rows })
  } catch (e) {
    console.error("[developer/pos/integrations GET]", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const module = body.module as string
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const providerSlug = typeof body.providerSlug === "string" ? body.providerSlug.trim() : "custom"
    const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : null
    const groceryStoreId = typeof body.groceryStoreId === "string" ? body.groceryStoreId : null
    const scopes = Array.isArray(body.scopes) ? body.scopes : defaultPosScopes()

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }
    if (module !== "FOOD" && module !== "GROCERY") {
      return NextResponse.json({ error: "module must be FOOD or GROCERY" }, { status: 400 })
    }
    if ((restaurantId ? 1 : 0) + (groceryStoreId ? 1 : 0) !== 1) {
      return NextResponse.json(
        { error: "Provide exactly one of restaurantId or groceryStoreId" },
        { status: 400 }
      )
    }

    if (module === "FOOD" && restaurantId) {
      const r = await prisma.restaurant.findFirst({
        where: { id: restaurantId, userId: user.id },
      })
      if (!r) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    } else if (module === "GROCERY" && groceryStoreId) {
      const g = await prisma.groceryStore.findFirst({
        where: { id: groceryStoreId, userId: user.id },
      })
      if (!g) return NextResponse.json({ error: "Grocery store not found" }, { status: 404 })
    } else {
      return NextResponse.json({ error: "Invalid module / store combination" }, { status: 400 })
    }

    const secret = generatePosApiSecret()
    const fp = fingerprintPosToken(secret)

    const integration = await prisma.posIntegration.create({
      data: {
        module: module as PosIntegrationModule,
        restaurantId: module === "FOOD" ? restaurantId : null,
        groceryStoreId: module === "GROCERY" ? groceryStoreId : null,
        name,
        providerSlug: providerSlug || "custom",
        settings: body.settings ?? undefined,
        credentials: {
          create: {
            tokenFingerprint: fp,
            tokenPrefix: tokenPrefixFromSecret(secret),
            label: "default",
            scopes,
          },
        },
      },
      include: { credentials: true },
    })

    return NextResponse.json(
      {
        integration,
        apiSecret: secret,
        hint: "Store apiSecret securely; it cannot be retrieved again. Use Authorization: Bearer <apiSecret> on /api/pos/v1/*",
      },
      { status: 201 }
    )
  } catch (e) {
    console.error("[developer/pos/integrations POST]", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
