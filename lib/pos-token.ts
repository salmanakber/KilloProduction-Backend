import crypto from "crypto"

const PREFIX = "pos_sk_"

export function generatePosApiSecret(): string {
  const raw = crypto.randomBytes(32).toString("hex")
  return `${PREFIX}${raw}`
}

export function fingerprintPosToken(secret: string): string {
  return crypto.createHash("sha256").update(secret, "utf8").digest("hex")
}

export function tokenPrefixFromSecret(secret: string): string {
  if (secret.length <= 14) return `${secret.slice(0, 8)}…`
  return `${secret.slice(0, 12)}…`
}

export function parseBearerToken(request: Request): string | null {
  const h = request.headers.get("authorization") || request.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m ? m[1].trim() : null
}
