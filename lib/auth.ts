import { jwtVerify, SignJWT } from "jose"
import bcrypt from "bcryptjs"
import { cookies } from "next/headers"
import { prisma } from "./prisma"
import { type NextRequest } from "next/server"

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"
const getSecretKey = () => new TextEncoder().encode(JWT_SECRET)

export interface JWTPayload {
  userId: string
  role: string
  modules?: string[]
  [key: string]: any
}

// ─── Password Hashing ─────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}

// ─── JWT Creation ─────────────────────────────────────────────────────────────

/** Resolves JWT `exp` from explicit override or SystemSettings.sessionTimeout (minutes). */
export async function resolveJwtExpiresIn(explicit?: string): Promise<string> {
  if (explicit) return explicit
  const row = await prisma.systemSettings.findFirst()
  const minsRaw = row?.sessionTimeout ?? 480
  const mins = Math.max(5, Math.min(60 * 24 * 30, Number(minsRaw) || 480))
  return `${mins}m`
}

export async function generateToken(payload: JWTPayload, expiresIn?: string): Promise<string> {
  const exp = await resolveJwtExpiresIn(expiresIn)
  const jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)

  return await jwt.sign(getSecretKey())
}

// ─── JWT Verification ─────────────────────────────────────────────────────────

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey())
    return payload as unknown as JWTPayload
  } catch (err) {
    console.error("Invalid JWT:", err)
    return null
  }
}

// ─── Authenticate From Cookie (Web) ──────────────────────────────────────────

export async function authenticateFromCookie() {
  const cookieStore = cookies()
  const token = cookieStore.get("admin-token")?.value
  console.log("token", token)

  if (!token) return null

  const payload = await verifyToken(token)
  if (!payload) return null

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      userProfile: true,
      userSettings: true,
      wallet: true,
    },
  })

  return user
}

// ─── Authenticate From Request (Web + Mobile) ─────────────────────────────────

export async function authenticateRequest(request?: NextRequest) {
  let token: string | null = null

  if (request) {
    const authHeader = request.headers.get("authorization")
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7)
    }
    if (!token) {
      token = request.cookies.get("admin-token")?.value ?? null
    }
  } else {
    // Fallback to cookie for web requests
    const cookieStore = cookies()
    token = cookieStore.get("admin-token")?.value || null
  }

  if (!token) return null

  const payload = await verifyToken(token)
  if (!payload) return null

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      userProfile: true,
      userSettings: true,
      wallet: true,
    },
  })

  return user
}

// ─── Role-Based Guard ─────────────────────────────────────────────────────────

export function requireAuth(roles?: string[]) {
  return async () => {
    const user = await authenticateFromCookie()

    if (!user) {
      return new Response("Unauthorized", { status: 401 })
    }

    if (roles && !roles.includes(user.role)) {
      return new Response("Forbidden", { status: 403 })
    }

    return user
  }
}
