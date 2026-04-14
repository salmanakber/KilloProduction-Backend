import type { NextRequest } from "next/server"

/**
 * Worker/cron calls use the same pattern as /api/cron/* routes: Authorization: Bearer CRON_SECRET.
 * Food rider broadcast also accepts FOOD_DISPATCH_INTERNAL_SECRET if set.
 */
export function getInternalServiceBearerToken(): string | null {
  return (
    process.env.FOOD_DISPATCH_INTERNAL_SECRET ||
    process.env.CRON_SECRET ||
    null
  )
}

export function isValidInternalBearerAuth(request: NextRequest): boolean {
  const auth = request.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token) return false
  const food = process.env.FOOD_DISPATCH_INTERNAL_SECRET
  const cron = process.env.CRON_SECRET
  if (food && token === food) return true
  if (cron && token === cron) return true
  return false
}
