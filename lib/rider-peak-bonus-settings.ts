import { prisma } from "@/lib/prisma"

export type RiderPeakBonusNumericSettings = {
  /** `openRequests / max(1, activeRiders)` must exceed this to create a challenge. */
  demandThreshold: number
  /** Challenge length in minutes. */
  windowMinutes: number
  minTargetRides: number
  maxTargetRides: number
  /** Integer rides target uses `round(targetBase + peakScore * targetPeakScale)` before clamp. */
  targetBase: number
  targetPeakScale: number
  /** Bonus pool cap = incrementalRides × profitPerRide × this (0–1 typical). */
  bonusProfitShare: number
  /** Commission discount uses `min(50, round((peakScore - 1) * factor))`. */
  commissionPeakFactor: number
  /** Per-online-rider baseline completions per hour (model input). */
  baselineUtilPerHour: number
  /** Per-online-rider expected completions per hour under bonus (model input). */
  expectedUtilPerHour: number
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.round(clamp(n, lo, hi))
}

let cache: { at: number; value: RiderPeakBonusNumericSettings } | null = null
const TTL_MS = 30_000

export function invalidateRiderPeakBonusSettingsCache(): void {
  cache = null
}

/**
 * Tunable numeric parameters for peak rider bonus (Admin → Riders → Bonus settings).
 * Cached briefly to keep the dispatch worker DB-light.
 */
export async function getRiderPeakBonusNumericSettings(): Promise<RiderPeakBonusNumericSettings> {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) {
    return cache.value
  }

  const row = await prisma.systemSettings.findFirst({
    select: {
      riderPeakBonusDemandThreshold: true,
      riderPeakBonusWindowMinutes: true,
      riderPeakBonusMinTargetRides: true,
      riderPeakBonusMaxTargetRides: true,
      riderPeakBonusTargetBase: true,
      riderPeakBonusTargetPeakScale: true,
      riderPeakBonusBonusProfitShare: true,
      riderPeakBonusCommissionPeakFactor: true,
      riderPeakBonusBaselineUtilPerHour: true,
      riderPeakBonusExpectedUtilPerHour: true,
    },
  })

  const value: RiderPeakBonusNumericSettings = {
    demandThreshold: clamp(row?.riderPeakBonusDemandThreshold ?? 1.2, 1.01, 20),
    windowMinutes: clampInt(row?.riderPeakBonusWindowMinutes ?? 90, 30, 240),
    minTargetRides: clampInt(row?.riderPeakBonusMinTargetRides ?? 2, 1, 50),
    maxTargetRides: clampInt(row?.riderPeakBonusMaxTargetRides ?? 12, 1, 50),
    targetBase: clamp(row?.riderPeakBonusTargetBase ?? 2, 0, 50),
    targetPeakScale: clamp(row?.riderPeakBonusTargetPeakScale ?? 2, 0, 20),
    bonusProfitShare: clamp(row?.riderPeakBonusBonusProfitShare ?? 0.7, 0.05, 1),
    commissionPeakFactor: clamp(row?.riderPeakBonusCommissionPeakFactor ?? 25, 1, 50),
    baselineUtilPerHour: clamp(row?.riderPeakBonusBaselineUtilPerHour ?? 0.35, 0.01, 2),
    expectedUtilPerHour: clamp(row?.riderPeakBonusExpectedUtilPerHour ?? 0.9, 0.01, 3),
  }

  if (value.maxTargetRides < value.minTargetRides) {
    value.maxTargetRides = value.minTargetRides
  }

  cache = { at: now, value }
  return value
}
