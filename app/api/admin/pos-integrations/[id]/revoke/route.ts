import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

function isAdmin(role: string) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

/**
 * Admin: revoke one credential or all active keys on an integration.
 * Body: { credentialId?: string } — omit to revoke all.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !isAdmin(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: integrationId } = await params
    const body = await request.json().catch(() => ({}))
    const credentialId = typeof body.credentialId === "string" ? body.credentialId : null

    const integration = await prisma.posIntegration.findFirst({
      where: { id: integrationId },
    })
    if (!integration) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
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
    console.error("[admin/pos-integrations/revoke]", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
