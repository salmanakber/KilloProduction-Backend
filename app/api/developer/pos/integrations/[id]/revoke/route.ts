import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * POST — revoke one credential or all credentials on an integration (vendor must own the store).
 * Body: { credentialId?: string } — omit credentialId to revoke all active keys.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const integrationId = params.id
    const body = await request.json().catch(() => ({}))
    const credentialId = typeof body.credentialId === "string" ? body.credentialId : null

    const integration = await prisma.posIntegration.findFirst({
      where: { id: integrationId },
      include: {
        restaurant: { select: { userId: true } },
        groceryStore: { select: { userId: true } },
      },
    })
    if (!integration) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const ownerId =
      integration.restaurant?.userId ?? integration.groceryStore?.userId ?? null
    if (ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const now = new Date()
    if (credentialId) {
      await prisma.posApiCredential.updateMany({
        where: {
          id: credentialId,
          integrationId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      })
    } else {
      await prisma.posApiCredential.updateMany({
        where: { integrationId, revokedAt: null },
        data: { revokedAt: now },
      })
    }

    return NextResponse.json({ ok: true, revokedAt: now.toISOString() })
  } catch (e) {
    console.error("[developer/pos/revoke]", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
