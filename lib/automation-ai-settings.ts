import { prisma } from "@/lib/prisma"

export type AutomationAiSettings = {
  marketingAiEnabled: boolean
  marketingAiMaxCandidates: number
  riderBonusAiEnabled: boolean
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, Math.floor(n)))
}

let cache: { at: number; value: AutomationAiSettings } | null = null
const TTL_MS = 30_000

/** Call after admin saves system settings so workers pick up toggles within ~1s. */
export function invalidateAutomationAiSettingsCache(): void {
  cache = null
}

/**
 * Reads automation AI toggles from `system_settings` (Admin → Settings → Notifications).
 * Short TTL cache to limit DB reads from high-frequency rider bonus ticks.
 * Optional env overrides (for emergencies / CI): MARKETING_AI_ENABLED, MARKETING_AI_MAX_CANDIDATES, RIDER_BONUS_AI_ENABLED.
 */
export async function getAutomationAiSettings(): Promise<AutomationAiSettings> {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) {
    return applyEnvOverrides(cache.value)
  }

  const row = await prisma.systemSettings.findFirst({
    select: {
      marketingAutomationAiEnabled: true,
      marketingAutomationAiMaxCandidates: true,
      riderBonusAiEnabled: true,
    },
  })

  const value: AutomationAiSettings = {
    marketingAiEnabled: row?.marketingAutomationAiEnabled ?? true,
    marketingAiMaxCandidates: clampInt(row?.marketingAutomationAiMaxCandidates ?? 12, 1, 20),
    riderBonusAiEnabled: row?.riderBonusAiEnabled ?? false,
  }
  cache = { at: now, value }
  return applyEnvOverrides(value)
}

function applyEnvOverrides(base: AutomationAiSettings): AutomationAiSettings {
  const m = process.env.MARKETING_AI_ENABLED
  const mc = process.env.MARKETING_AI_MAX_CANDIDATES
  const r = process.env.RIDER_BONUS_AI_ENABLED
  return {
    marketingAiEnabled:
      m !== undefined ? String(m).toLowerCase() !== "false" : base.marketingAiEnabled,
    marketingAiMaxCandidates:
      mc !== undefined && Number.isFinite(Number(mc))
        ? clampInt(Number(mc), 1, 20)
        : base.marketingAiMaxCandidates,
    riderBonusAiEnabled:
      r !== undefined ? String(r).toLowerCase() === "true" : base.riderBonusAiEnabled,
  }
}
