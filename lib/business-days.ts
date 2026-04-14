/** Weekend + optional fixed holidays (YYYY-MM-DD, local calendar). Extend as needed. */
const DEFAULT_HOLIDAY_KEYS = new Set<string>([
  // Nigeria public (examples — adjust per operations policy)
  "01-01",
  "05-01",
  "10-01",
  "12-25",
  "12-26",
])

function dateKeyUTC(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${m}-${day}`
}

export function isWeekendUTC(d: Date): boolean {
  const day = d.getUTCDay()
  return day === 0 || day === 6
}

export function isHolidayUTC(d: Date, extraHolidayKeys?: Set<string>): boolean {
  const keys = extraHolidayKeys ?? DEFAULT_HOLIDAY_KEYS
  return keys.has(dateKeyUTC(d))
}

export function isBusinessDayUTC(d: Date, extraHolidayKeys?: Set<string>): boolean {
  return !isWeekendUTC(d) && !isHolidayUTC(d, extraHolidayKeys)
}

/**
 * Returns the datetime (UTC) after `businessDays` business days from `from` (exclusive of partial day — starts next business slice from calendar day of `from`).
 * Implementation: step calendar days forward, count only business days.
 */
export function addBusinessDaysUTC(from: Date, businessDays: number, extraHolidayKeys?: Set<string>): Date {
  if (businessDays <= 0) return new Date(from)
  const d = new Date(from.getTime())
  let remaining = businessDays
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (isBusinessDayUTC(d, extraHolidayKeys)) remaining -= 1
  }
  return d
}

/** Eligible-for-withdrawal time for a wallet credit that completed at `creditCompletedAt`. */
export function creditWithdrawableAfterUTC(
  creditCompletedAt: Date,
  clearingBusinessDays: number,
  extraHolidayKeys?: Set<string>
): Date {
  return addBusinessDaysUTC(creditCompletedAt, clearingBusinessDays, extraHolidayKeys)
}
