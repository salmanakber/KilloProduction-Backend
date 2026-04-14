/** Weekly schedule: keys are lowercase day names (sunday..saturday), values have open/close "HH:mm" */
export type OpeningHoursJson = Record<string, { open?: string; close?: string } | undefined>

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const

/** Matches customer-facing “open now” (see food/nearby-restaurants). */
export function effectiveRestaurantOpenNow(openingHours: unknown, isOpenFlag: boolean): boolean {
  if (!isOpenFlag) return false
  if (!openingHours || typeof openingHours !== "object") return isOpenFlag
  const oh = openingHours as OpeningHoursJson
  const now = new Date()
  const currentDay = DAY_NAMES[now.getDay()]
  const todayHours = oh[currentDay]
  if (!todayHours || !todayHours.open || !todayHours.close) {
    return isOpenFlag
  }
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  return currentTime >= todayHours.open && currentTime <= todayHours.close
}

/**
 * When vendor tries to turn store online (isOpen=true), allow only if current time is inside today's window
 * when that window is defined. If today has no open/close, or openingHours is empty, allow (manual mode).
 */
export function canTurnOnlineNow(openingHours: unknown): { ok: true } | { ok: false; message: string } {
  if (!openingHours || typeof openingHours !== "object") {
    return { ok: true }
  }
  const oh = openingHours as OpeningHoursJson
  const now = new Date()
  const currentDay = DAY_NAMES[now.getDay()]
  const today = oh[currentDay]
  if (!today || !today.open || !today.close) {
    return { ok: true }
  }
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  if (currentTime >= today.open && currentTime <= today.close) {
    return { ok: true }
  }
  return {
    ok: false,
    message: `Outside opening hours for today (${today.open}–${today.close}). Update hours in profile or try again when open.`,
  }
}
