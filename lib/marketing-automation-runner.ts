import type { AIUseCase } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"
import { analyzeWithAI, getConfigurationForUseCase } from "@/lib/ai/queue"
import {
  buildCompactAiRows,
  enrichCandidatesWithUserActivity,
  moduleToCustomerRoute,
  parseAiIndexPick,
  rankAndTrimForAiPool,
  type EnrichedMarketingCandidate,
} from "@/lib/marketing-targeting-helpers"

const COOLDOWN_HOURS = 48
const MAX_SEND_PER_RUN = 25
const HEURISTIC_POOL = 80

function envInt(name: string, defaultValue: number): number {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : defaultValue
}

function marketingAiEnabled(): boolean {
  return String(process.env.MARKETING_AI_ENABLED || "true").toLowerCase() !== "false"
}

/**
 * Scheduled job: behavior-driven notifications (abandoned cart, re-engagement).
 * Heuristics + UserActivity signals do most of the work; optional AI only refines a tiny index list.
 */
export async function runMarketingAutomationTick(): Promise<{ sent: number; skipped: string }> {
  const cooldown = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000)
  const recent = await prisma.notification.findMany({
    where: { sentAt: { gte: cooldown } },
    select: { userId: true },
  })
  const exclude = new Set(recent.map((n) => n.userId))

  const since72h = new Date(Date.now() - 72 * 60 * 60 * 1000)

  const recentCartRows = await prisma.userActivity.findMany({
    where: {
      activityType: "ADD_TO_CART",
      createdAt: { gte: since72h },
    },
    select: { userId: true },
    orderBy: { createdAt: "desc" },
    take: 1200,
  })
  const cartCountByUser = new Map<string, number>()
  for (const row of recentCartRows) {
    cartCountByUser.set(row.userId, (cartCountByUser.get(row.userId) ?? 0) + 1)
  }
  const cartGroups = [...cartCountByUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 500)
    .map(([userId, n]) => ({ userId, cartCount: n }))

  let userIds = cartGroups.map((g) => g.userId).filter((id) => !exclude.has(id))
  if (userIds.length === 0) {
    return { sent: 0, skipped: "no_candidates" }
  }

  const activityMap = await enrichCandidatesWithUserActivity(userIds, since72h)

  const enriched: EnrichedMarketingCandidate[] = []
  for (const g of cartGroups) {
    if (exclude.has(g.userId)) continue
    const sig = activityMap.get(g.userId)
    if (!sig) continue
    enriched.push({
      userId: g.userId,
      module: sig.module,
      cartEvents: Math.max(sig.cartEvents, g.cartCount),
      itemViews: sig.itemViews,
      purchases72h: sig.purchases72h,
      searches: sig.searches,
      hoursSinceLastCart: sig.hoursSinceLastCart,
      score: 0,
    })
  }

  const ranked = rankAndTrimForAiPool(enriched, HEURISTIC_POOL)
  if (ranked.length === 0) {
    return { sent: 0, skipped: "no_candidates" }
  }

  const automation = await getAutomationAiSettings()
  const aiMax = Math.min(20, automation.marketingAiMaxCandidates)
  let chosenIds = ranked.slice(0, MAX_SEND_PER_RUN).map((c) => c.userId)

  const useAi = automation.marketingAiEnabled
  const aiConfig = useAi ? await getConfigurationForUseCase("GENERAL_ANALYSIS" as AIUseCase) : null

  if (useAi && aiConfig && ranked.length > 0) {
    const pool = ranked.slice(0, aiMax)
    const rows = buildCompactAiRows(pool)
    try {
      const ai = await analyzeWithAI("GENERAL_ANALYSIS" as AIUseCase, { r: rows }, {
        customPrompt: `Pick abandoned-cart reminder recipients. Rows use index i only (no user ids). Keys: m=F food G=grocery P=pharmacy A=auto; s=cart adds; v=item views; pur=purchases 72h; h=hours since last cart.
Prefer users with pur=0 or low pur and fresh carts (low h). Max ${MAX_SEND_PER_RUN} picks.
Reply ONLY: {"idx":[...]} using indices 0..${pool.length - 1}.`,
        maxTokens: Math.min(256, 80 + pool.length * 8),
        disableTools: true,
      })
      const idx = parseAiIndexPick(ai.content || "", pool.length, MAX_SEND_PER_RUN)
      if (idx && idx.length > 0) {
        chosenIds = idx.map((i) => pool[i]!.userId).filter(Boolean)
      }
    } catch {
      chosenIds = ranked.slice(0, MAX_SEND_PER_RUN).map((c) => c.userId)
    }
  }

  const byId = new Map(ranked.map((c) => [c.userId, c]))
  let sent = 0
  for (const userId of chosenIds) {
    const meta = byId.get(userId)
    const module = meta?.module || "FOOD"
    const { routeName, actionUrl } = moduleToCustomerRoute(module)
    try {
      await NotificationBridge.sendNotification({
        userId,
        title: "Still thinking it over?",
        message:
          "Your cart has items waiting — open the app to finish checkout in a few taps.",
        type: "PROMOTION",
        module: module as any,
        actionUrl,
        data: {
          routeName,
          source: "marketing_automation",
          campaign: "abandoned_cart",
        },
      })
      sent++
    } catch {
      // continue
    }
  }

  return { sent, skipped: sent === 0 ? "send_failed" : "ok" }
}
