import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { defaultPosScopes } from "@/lib/pos-integration-auth"
import { generatePosApiSecret, fingerprintPosToken, tokenPrefixFromSecret } from "@/lib/pos-token"

function isAdmin(role: string) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

/**
 * Admin: issue a new API credential; optionally revoke others. Secret shown once.
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
    const revokeOthers = Boolean(body.revokeOthers)
    const label = typeof body.label === "string" ? body.label : "admin-rotated"

    const integration = await prisma.posIntegration.findFirst({
      where: { id: integrationId },
    })
    if (!integration) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const secret = generatePosApiSecret()
    const fp = fingerprintPosToken(secret)
    const now = new Date()

    await prisma.$transaction(async (tx) => {
      if (revokeOthers) {
        await tx.posApiCredential.updateMany({
          where: { integrationId: integration.id, revokedAt: null },
          data: { revokedAt: now },
        })
      }
      await tx.posApiCredential.create({
        data: {
          integrationId: integration.id,
          tokenFingerprint: fp,
          tokenPrefix: tokenPrefixFromSecret(secret),
          label,
          scopes: Array.isArray(body.scopes) ? body.scopes : defaultPosScopes(),
        },
      })
    })

    return NextResponse.json({
      apiSecret: secret,
      hint: "Shown once. Use Authorization: Bearer <apiSecret> on /api/pos/v1/*",
    })
  } catch (e) {
    console.error("[admin/pos-integrations/rotate]", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
