import { prisma } from "@/lib/prisma"
import { fingerprintPosToken, parseBearerToken } from "@/lib/pos-token"
import type { PosIntegration, PosApiCredential, PosIntegrationModule } from "@prisma/client"

export type PosAuthContext = {
  integration: PosIntegration
  credential: PosApiCredential
  module: PosIntegrationModule
  restaurantId: string | null
  groceryStoreId: string | null
}

function hasScope(scopes: unknown, need: string): boolean {
  if (!Array.isArray(scopes)) return false
  if (scopes.includes("*")) return true
  return scopes.includes(need)
}

/**
 * Authenticate external POS request via `Authorization: Bearer pos_sk_...`.
 */
export async function authenticatePosRequest(
  request: Request,
  requiredScope?: string
): Promise<PosAuthContext | null> {
  const secret = parseBearerToken(request)
  if (!secret || !secret.startsWith("pos_sk_")) return null

  const fp = fingerprintPosToken(secret)
  const cred = await prisma.posApiCredential.findFirst({
    where: {
      tokenFingerprint: fp,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      integration: true,
    },
  })
  if (!cred || !cred.integration.isActive) return null

  if (requiredScope && !hasScope(cred.scopes, requiredScope)) {
    return null
  }

  await prisma.posApiCredential.update({
    where: { id: cred.id },
    data: { lastUsedAt: new Date() },
  })

  return {
    integration: cred.integration,
    credential: cred,
    module: cred.integration.module,
    restaurantId: cred.integration.restaurantId,
    groceryStoreId: cred.integration.groceryStoreId,
  }
}

export function defaultPosScopes(): string[] {
  return [
    "products:read",
    "products:write",
    "orders:read",
    "orders:write",
    "payments:read",
    "settings:read",
    "settings:write",
  ]
}
