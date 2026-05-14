import type { AIUseCase } from "@prisma/client"
import { analyzeWithAI, getConfigurationForUseCase } from "@/lib/ai/queue"
import { getAutomationAiSettings } from "./automation-ai-settings"

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, Math.floor(n)))
}

export type BonusTuningInput = {
  peakScore: number
  openRequests: number
  activeRiders: number
  profitPerRide: number
  minTargetRides?: number
  maxTargetRides?: number
}

export type BonusTuningResult = {
  targetRides: number
  commissionDiscountPct: number
}

/**
 * Optional micro-prompt: enabled from Admin → Settings → Notifications (rider bonus AI), or RIDER_BONUS_AI_ENABLED env override.
 * Requires active GENERAL_ANALYSIS config. Any parse failure → baseline.
 */
export async function maybeTuneBonusWithAi(
  baseline: BonusTuningResult,
  input: BonusTuningInput
): Promise<BonusTuningResult> {
  const { riderBonusAiEnabled: enabled } = await getAutomationAiSettings()
  if (!enabled) return baseline

  const cfg = await getConfigurationForUseCase("GENERAL_ANALYSIS" as AIUseCase)
  if (!cfg) return baseline

  const payload = {
    ps: Math.round(input.peakScore * 100) / 100,
    or: input.openRequests,
    ar: input.activeRiders,
    ppr: Math.round(input.profitPerRide * 100) / 100,
    b: baseline,
  }

  try {
    const ai = await analyzeWithAI("GENERAL_ANALYSIS" as AIUseCase, payload, {
      customPrompt: `Tune peak rider challenge. Input JSON has ps=peak ratio, or=open jobs, ar=online riders, ppr=avg profit/ride, b=baseline {targetRides, commissionDiscountPct}.
Reply ONLY: {"tr":2-12,"cd":0-50} integers. tr=target rides, cd=commission discount %.`,
      maxTokens: 96,
      disableTools: true,
    })
    const text = ai.content || ""
    const m = text.match(/\{[\s\S]*"tr"[\s\S]*\}/)
    if (!m) return baseline
    const parsed = JSON.parse(m[0]) as { tr?: number; cd?: number }
    const tr = Number(parsed.tr)
    const cd = Number(parsed.cd)
    if (!Number.isFinite(tr) || !Number.isFinite(cd)) return baseline
    const minTr = clampInt(input.minTargetRides ?? 2, 1, 50)
    const maxTr = clampInt(input.maxTargetRides ?? 12, minTr, 50)
    const targetRides = Math.min(maxTr, Math.max(minTr, Math.round(tr)))
    const commissionDiscountPct = Math.min(50, Math.max(0, Math.round(cd)))
    return { targetRides, commissionDiscountPct }
  } catch {
    return baseline
  }
}
