import type { AIUseCase, Module, UserActivityType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { analyzeWithAI } from "@/lib/ai/queue"

const SHOP_ACTIVITY: UserActivityType[] = [
  "SEARCH",
  "VIEW_ITEM",
  "ADD_TO_CART",
  "PURCHASE",
  "SMART_CART_AI",
  "MEAL_PLANNER",
  "REORDER_LAST",
]

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "your",
  "near",
  "me",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "at",
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP.has(w))
}

function topKeywords(counts: Map<string, number>, n: number): string[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k)
}

function parseAiJson(content: string): unknown {
  let cleaned = String(content || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
  const first = cleaned.indexOf("{")
  const last = cleaned.lastIndexOf("}")
  if (first !== -1 && last !== -1) cleaned = cleaned.substring(first, last + 1)
  return JSON.parse(cleaned)
}

function normalizeStrings(arr: unknown, max: number): string[] {
  if (!Array.isArray(arr)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of arr) {
    const s = typeof x === "string" ? x.trim() : ""
    if (s.length < 3 || s.length > 120) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= max) break
  }
  return out
}

const FOOD_DEFAULT_ASK = [
  "Looking for burgers nearby",
  "Healthy lunch under 30 min",
  "Family dinner ideas",
  "Late-night delivery options",
  "Budget-friendly meals for two",
]

const FOOD_DEFAULT_PLAN = [
  "Plan a balanced week of dinners",
  "High-protein meals for the week",
  "Kid-friendly meals Mon–Fri",
]

const GROCERY_DEFAULT_ASK = [
  "Restock milk and eggs",
  "Weekly fresh produce run",
  "Pantry staples refill",
  "Snacks for the week",
  "Quick breakfast essentials",
]

const GROCERY_DEFAULT_PLAN = [
  "Weekly meal prep ingredients",
  "Budget grocery list for 5 days",
  "Healthy staples for meal planning",
]

function fallbackFromKeywords(
  module: "FOOD" | "GROCERY",
  keywords: string[]
): { askAnything: string[]; mealPlanning: string[] } {
  const ask: string[] = []
  const plan: string[] = []
  const defAsk = module === "FOOD" ? FOOD_DEFAULT_ASK : GROCERY_DEFAULT_ASK
  const defPlan = module === "FOOD" ? FOOD_DEFAULT_PLAN : GROCERY_DEFAULT_PLAN

  for (const kw of keywords) {
    if (module === "FOOD") {
      ask.push(`Looking for ${kw}`)
      plan.push(`Plan meals around ${kw} this week`)
    } else {
      ask.push(`Restock ${kw}`)
      plan.push(`Weekly shop including ${kw}`)
    }
    if (ask.length >= 6) break
  }
  while (ask.length < 8) {
    const d = defAsk[ask.length % defAsk.length]
    if (!ask.some((q) => q.toLowerCase() === d.toLowerCase())) ask.push(d)
    else ask.push(`${d} (${ask.length + 1})`)
    if (ask.length >= 8) break
  }
  while (plan.length < 4) {
    plan.push(defPlan[plan.length % defPlan.length])
  }
  return {
    askAnything: ask.slice(0, 8),
    mealPlanning: plan.slice(0, 6),
  }
}

export type SmartShopSuggestedQuestionsResult = {
  /** Tap-to-run in “Ask anything” (chat) */
  askAnything: string[]
  /** Tap-to-run on meal planner tab */
  mealPlanning: string[]
}

/**
 * Builds context from DB, then asks the configured AI (GENERAL_ANALYSIS) to propose
 * short tap prompts for Smart Shop — separate lists for chat vs meal planning.
 */
export async function buildSmartShopSuggestedQuestions(
  userId: string,
  module: "FOOD" | "GROCERY"
): Promise<SmartShopSuggestedQuestionsResult> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const [activities, orders] = await Promise.all([
    prisma.userActivity.findMany({
      where: {
        userId,
        module: module as Module,
        activityType: { in: SHOP_ACTIVITY },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 250,
      select: {
        searchQuery: true,
        viewedItemName: true,
        metadata: true,
        itemsPurchased: true,
      },
    }),
    prisma.order.findMany({
      where: {
        customerId: userId,
        module: module as Module,
        createdAt: { gte: since },
        status: { notIn: ["CANCELLED", "REFUNDED", "WITHDRAWN", "EXPIRED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        orderItems: { select: { productName: true } },
      },
    }),
  ])

  const counts = new Map<string, number>()
  const searchSamples: string[] = []
  const viewedSamples: string[] = []
  const purchaseSamples: string[] = []

  for (const a of activities) {
    if (a.searchQuery) {
      searchSamples.push(a.searchQuery)
      for (const w of tokenize(a.searchQuery)) counts.set(w, (counts.get(w) || 0) + 2)
    }
    if (a.viewedItemName) {
      viewedSamples.push(a.viewedItemName)
      for (const w of tokenize(a.viewedItemName)) counts.set(w, (counts.get(w) || 0) + 1)
    }
    const meta = a.metadata as Record<string, unknown> | null
    const mq = meta && typeof meta.searchQuery === "string" ? meta.searchQuery : ""
    if (mq) {
      searchSamples.push(mq)
      for (const w of tokenize(mq)) counts.set(w, (counts.get(w) || 0) + 1)
    }
    const items = a.itemsPurchased as Array<{ name?: string }> | null
    if (Array.isArray(items)) {
      for (const it of items) {
        if (it?.name) {
          purchaseSamples.push(String(it.name))
          for (const w of tokenize(String(it.name))) counts.set(w, (counts.get(w) || 0) + 1)
        }
      }
    }
  }
  for (const o of orders) {
    for (const li of o.orderItems) {
      if (li.productName) {
        purchaseSamples.push(li.productName)
        for (const w of tokenize(li.productName)) counts.set(w, (counts.get(w) || 0) + 1)
      }
    }
  }

  const keywords = topKeywords(counts, 12)
  const contextLines = [
    `Module: ${module} (FOOD = restaurant delivery menus; GROCERY = supermarket products).`,
    `Top weighted keywords: ${keywords.length ? keywords.join(", ") : "(none yet)"}.`,
    `Sample searches (up to 15): ${Array.from(new Set(searchSamples)).slice(0, 15).join(" | ") || "(none)"}.`,
    `Sample viewed names (up to 15): ${Array.from(new Set(viewedSamples)).slice(0, 15).join(" | ") || "(none)"}.`,
    `Sample purchased names (up to 20): ${Array.from(new Set(purchaseSamples)).slice(0, 20).join(" | ") || "(none)"}.`,
  ].join("\n")

  const prompt = `You personalize quick-tap suggestions for a ${module} smart-shopping app.

User activity summary:
${contextLines}

Return JSON only (no markdown), exactly this shape:
{
  "askAnything": [ "string", ... ],
  "mealPlanning": [ "string", ... ]
}

Rules:
- askAnything: exactly 8 short questions the user can tap to run "Ask anything" / chat shopping (natural, specific, actionable; mix their interests with variety).
- mealPlanning: exactly 4–6 short prompts suited to the "Plan your week" / meal-planner flow (weekly grocery or multi-day meals, dietary variety).
- Entirely ${module === "FOOD" ? "food delivery / restaurants" : "grocery / supermarket"} — no other modules.
- If history is sparse, invent realistic, appetizing defaults for the module.
- Each string under 100 characters. No numbering or bullets inside strings.`

  try {
    const ai = await analyzeWithAI("GENERAL_ANALYSIS" as AIUseCase, { module, userId, keywords }, {
      category: "TEXT_TO_TEXT",
      customPrompt: prompt,
      maxTokens: 900,
      disableTools: true,
    })

    const parsed = parseAiJson(ai.content || "{}") as {
      askAnything?: unknown
      mealPlanning?: unknown
    }

    let askAnything = normalizeStrings(parsed.askAnything, 8)
    let mealPlanning = normalizeStrings(parsed.mealPlanning, 6)

    if (askAnything.length < 4 || mealPlanning.length < 2) {
      const fb = fallbackFromKeywords(module, keywords)
      if (askAnything.length < 4) askAnything = fb.askAnything
      if (mealPlanning.length < 2) mealPlanning = fb.mealPlanning
    }

    return {
      askAnything: askAnything.slice(0, 8),
      mealPlanning: mealPlanning.slice(0, 6),
    }
  } catch (e) {
    console.warn("[smart-shop-suggested-questions] AI failed, using fallback:", e)
    return fallbackFromKeywords(module, keywords)
  }
}
