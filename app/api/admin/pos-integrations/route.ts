import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

function isAdmin(role: string) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

/**
 * Admin: list all POS integrations (food/grocery store links) with credentials and summary stats.
 * Used by Developer → POS & Partner APIs for partner oversight and reporting.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !isAdmin(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rows = await prisma.posIntegration.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        restaurant: { select: { id: true, name: true, userId: true } },
        groceryStore: { select: { id: true, storeName: true, userId: true } },
        credentials: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            tokenPrefix: true,
            label: true,
            lastUsedAt: true,
            revokedAt: true,
            createdAt: true,
          },
        },
      },
    })

    const activeCreds = rows.reduce(
      (n, r) => n + r.credentials.filter((c) => !c.revokedAt).length,
      0
    )
    const revokedCreds = rows.reduce(
      (n, r) => n + r.credentials.filter((c) => c.revokedAt).length,
      0
    )
    const byProvider: Record<string, number> = {}
    for (const r of rows) {
      const k = r.providerSlug || "custom"
      byProvider[k] = (byProvider[k] ?? 0) + 1
    }

    let lastApiUse: string | null = null
    for (const r of rows) {
      for (const c of r.credentials) {
        if (c.revokedAt || !c.lastUsedAt) continue
        const iso = c.lastUsedAt.toISOString()
        if (!lastApiUse || iso > lastApiUse) lastApiUse = iso
      }
    }

    const stats = {
      totalIntegrations: rows.length,
      food: rows.filter((r) => r.module === "FOOD").length,
      grocery: rows.filter((r) => r.module === "GROCERY").length,
      activeCredentials: activeCreds,
      revokedCredentials: revokedCreds,
      byProvider,
      lastApiUseGlob: lastApiUse,
    }

    return NextResponse.json({ integrations: rows, stats })
  } catch (e) {
    console.error("[admin/pos-integrations GET]", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
