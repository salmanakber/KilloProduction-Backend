import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { defaultPosScopes } from "@/lib/pos-integration-auth"
import { generatePosApiSecret, fingerprintPosToken, tokenPrefixFromSecret } from "@/lib/pos-token"

/**
 * POST — issue a new API credential; optionally revoke others.
 * Body: { revokeOthers?: boolean, label?: string }
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

    const body = await request.json().catch(() => ({}))
    const revokeOthers = Boolean(body.revokeOthers)
    const label = typeof body.label === "string" ? body.label : "rotated"

    const integration = await prisma.posIntegration.findFirst({
      where: { id: params.id },
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
      hint: "Shown once. Previous keys revoked if revokeOthers was true.",
    })
  } catch (e) {
    console.error("[developer/pos/rotate]", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
