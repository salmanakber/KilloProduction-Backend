import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const RIDER_COMMISSION_LOCK_CODE = "RIDER_COMMISSION_LOCKED"

/** Paths riders may call while commission-locked (status check only). */
const RIDER_LOCK_EXEMPT_PREFIXES = ["/api/auth/me", "/api/auth/logout"]

export async function isRiderCommissionLocked(userId: string): Promise<boolean> {
  const profile = await prisma.riderProfile.findUnique({
    where: { userId },
    select: { isCommissionLocked: true },
  })
  return Boolean(profile?.isCommissionLocked)
}

export function riderCommissionLockResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        "Your rider account is temporarily locked due to unpaid platform dues. Please contact support for reactivation.",
      code: RIDER_COMMISSION_LOCK_CODE,
    },
    { status: 403 }
  )
}

export function rejectIfRiderCommissionLocked(user: {
  role?: string
  id?: string
  __riderCommissionLocked?: boolean
} | null): NextResponse | null {
  if (user?.role !== "RIDER") return null
  if (user.__riderCommissionLocked) {
    return riderCommissionLockResponse()
  }
  return null
}

/** Async guard — always checks DB (use when authenticateRequest() has no request URL). */
export async function rejectIfRiderCommissionLockedAsync(user: {
  role?: string
  id?: string
  __riderCommissionLocked?: boolean
} | null): Promise<NextResponse | null> {
  const sync = rejectIfRiderCommissionLocked(user)
  if (sync) return sync
  if (user?.role === "RIDER" && user.id) {
    const locked = await isRiderCommissionLocked(user.id)
    if (locked) return riderCommissionLockResponse()
  }
  return null
}

/**
 * Authenticates rider API requests and blocks commission-locked accounts
 * (except auth/me for the blocking screen to hydrate).
 */
export async function authenticateRiderAppRequest(request: NextRequest) {
  const user = await authenticateRequest(request)
  if (!user) {
    return { user: null as null, errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  if (user.role !== "RIDER") {
    return {
      user: null as null,
      errorResponse: NextResponse.json({ error: "Forbidden - Rider access only" }, { status: 403 }),
    }
  }

  const pathname = new URL(request.url).pathname
  const exempt = RIDER_LOCK_EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
  if (!exempt) {
    const locked = await isRiderCommissionLocked(user.id)
    if (locked) {
      return { user: null as null, errorResponse: riderCommissionLockResponse() }
    }
  }

  return { user, errorResponse: null as null }
}
