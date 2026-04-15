import { prisma } from "@/lib/prisma"

/** Single-char module codes sent to AI to save tokens */
const MODULE_CODE: Record<string, string> = {
  FOOD: "F",
  GROCERY: "G",
  PHARMACY: "P",
  AUTO_PARTS: "A",
}

export type EnrichedMarketingCandidate = {
  userId: string
  module: string | null
  /** Primary abandoned-cart signal */
  cartEvents: number
  itemViews: number
  purchases72h: number
  searches: number
  hoursSinceLastCart: number
  /** Combined heuristic score (higher = better target) */
  score: number
}

export function moduleToCustomerRoute(module: string | null): {
  routeName: string
  actionUrl: string
} {
  switch (module) {
    case "GROCERY":
      return { routeName: "CustomerGrocery", actionUrl: "/CustomerGrocery" }
    case "PHARMACY":
      return { routeName: "CustomerPharmacy", actionUrl: "/CustomerPharmacy" }
    case "AUTO_PARTS":
      return { routeName: "CustomerAutoParts", actionUrl: "/CustomerAutoParts" }
    default:
      return { routeName: "CustomerFood", actionUrl: "/CustomerFood" }
  }
}

/**
 * Batch-load activity signals for users (single groupBy + one bounded scan for recency).
 */
export async function enrichCandidatesWithUserActivity(
  userIds: string[],
  since: Date
): Promise<Map<string, Omit<EnrichedMarketingCandidate, "userId" | "score">>> {
  const out = new Map<string, Omit<EnrichedMarketingCandidate, "userId" | "score">>()
  if (userIds.length === 0) return out

  for (const id of userIds) {
    out.set(id, {
      module: null,
      cartEvents: 0,
      itemViews: 0,
      purchases72h: 0,
      searches: 0,
      hoursSinceLastCart: 72,
    })
  }

  const grouped = await prisma.userActivity.groupBy({
    by: ["userId", "activityType"],
    where: {
      userId: { in: userIds },
      createdAt: { gte: since },
    },
    _count: { _all: true },
  })

  for (const row of grouped) {
    const cur = out.get(row.userId)
    if (!cur) continue
    const c = row._count._all
    switch (row.activityType) {
      case "ADD_TO_CART":
        cur.cartEvents += c
        break
      case "VIEW_ITEM":
        cur.itemViews += c
        break
      case "PURCHASE":
        cur.purchases72h += c
        break
      case "SEARCH":
      case "IMAGE_SEARCH":
        cur.searches += c
        break
      default:
        break
    }
  }

  const recentCarts = await prisma.userActivity.findMany({
    where: {
      userId: { in: userIds },
      activityType: "ADD_TO_CART",
      createdAt: { gte: since },
    },
    select: { userId: true, createdAt: true, module: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(2000, userIds.length * 25),
  })

  const seenLast = new Set<string>()
  const now = Date.now()
  for (const row of recentCarts) {
    if (seenLast.has(row.userId)) continue
    seenLast.add(row.userId)
    const cur = out.get(row.userId)
    if (!cur) continue
    cur.module = row.module ?? cur.module
    cur.hoursSinceLastCart = Math.max(
      0,
      Math.round((now - row.createdAt.getTime()) / (60 * 60 * 1000))
    )
  }

  return out
}

function heuristicScore(base: EnrichedMarketingCandidate): number {
  let s = base.cartEvents * 4 + base.itemViews * 0.5 + base.searches * 0.3
  if (base.purchases72h > 0) {
    s *= Math.max(0.15, 1 - base.purchases72h * 0.35)
  }
  if (base.hoursSinceLastCart <= 6) s += 2
  else if (base.hoursSinceLastCart <= 24) s += 1
  return s
}

/**
 * Pre-AI filter: drop unlikely targets and sort by score so the model only sees strong candidates.
 */
export function rankAndTrimForAiPool(
  rows: EnrichedMarketingCandidate[],
  maxPool: number
): EnrichedMarketingCandidate[] {
  const filtered = rows.filter((r) => {
    if (r.cartEvents < 1) return false
    if (r.purchases72h >= 3) return false
    return true
  })

  for (const r of filtered) {
    r.score = heuristicScore(r)
  }

  return filtered.sort((a, b) => b.score - a.score).slice(0, maxPool)
}

export type CompactAiRow = { i: number; m: string; s: number; v: number; pur: number; h: number }

/**
 * Minimal JSON-safe rows for the model (short keys, no UUIDs — indices only).
 */
export function buildCompactAiRows(candidates: EnrichedMarketingCandidate[]): CompactAiRow[] {
  return candidates.map((c, i) => ({
    i,
    m: MODULE_CODE[c.module || "FOOD"] || "F",
    s: Math.min(99, Math.round(c.cartEvents)),
    v: Math.min(99, Math.round(c.itemViews)),
    pur: Math.min(9, c.purchases72h),
    h: Math.min(99, Math.round(c.hoursSinceLastCart)),
  }))
}

export function parseAiIndexPick(content: string, n: number, maxPick: number): number[] | null {
  const text = content || ""
  const m = text.match(/\{[\s\S]*"idx"[\s\S]*\}/)
  if (!m) return null
  try {
    const parsed = JSON.parse(m[0]) as { idx?: unknown }
    if (!Array.isArray(parsed.idx)) return null
    const idx = parsed.idx
      .map((x) => (typeof x === "number" ? x : parseInt(String(x), 10)))
      .filter((x) => Number.isFinite(x) && x >= 0 && x < n)
    return [...new Set(idx)].slice(0, maxPick)
  } catch {
    return null
  }
}
