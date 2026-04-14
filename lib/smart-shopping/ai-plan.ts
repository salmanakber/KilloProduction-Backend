import { analyzeWithAI, type AIUseCase } from "@/lib/ai/queue"
import {
  getNearbyFoodCatalog,
  getNearbyGroceryCatalog,
  matchFoodLineToItem,
  matchGroceryLineToProduct,
  type NearbyFoodRow,
  type NearbyGroceryRow,
} from "./nearby-catalog"

export type SmartAction = "meal_plan" | "chat" | "weekly_plan"

function parseAiJson(content: string): any {
  let cleaned = content.trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "")
  const first = cleaned.indexOf("{")
  const last = cleaned.lastIndexOf("}")
  if (first !== -1 && last !== -1) cleaned = cleaned.substring(first, last + 1)
  return JSON.parse(cleaned)
}

function buildCatalogLinesGrocery(rows: NearbyGroceryRow[]): string {
  return rows
    .slice(0, 200)
    .map((r) => `- ${r.name} (${r.category}) @ ${r.storeName} [id:${r.id}]`)
    .join("\n")
}

function buildCatalogLinesFood(rows: NearbyFoodRow[]): string {
  return rows
    .slice(0, 200)
    .map((r) => `- ${r.name} @ ${r.restaurantName} [id:${r.id}]`)
    .join("\n")
}

export async function runGrocerySmartShopping(params: {
  latitude: number
  longitude: number
  maxKm?: number
  action: SmartAction
  userMessage: string
  selectedMeals?: string[]
  /** e.g. vegetarian | non_vegetarian — only items from catalog; AI must respect preference when choosing lines */
  dietPreference?: string | null
}): Promise<{
  reply: string
  cartLines: Array<{ productId: string; name: string; quantity: number; storeId: string; storeName: string; unitPrice: number; unit: string }>
  unmatched: string[]
}> {
  const maxKm = params.maxKm ?? 25
  const catalog = await getNearbyGroceryCatalog(params.latitude, params.longitude, maxKm, 280)
  if (catalog.length === 0) {
    return {
      reply: "No grocery items are available near your location right now. Try widening your area or pick a store.",
      cartLines: [],
      unmatched: [],
    }
  }

  const lines = buildCatalogLinesGrocery(catalog)
  const meals =
    params.selectedMeals?.length && params.action === "meal_plan"
      ? `User-selected meals for the week: ${params.selectedMeals.join(", ")}.`
      : ""

  const diet =
    params.dietPreference && String(params.dietPreference).trim()
      ? `Diet preference: ${String(params.dietPreference).trim()}. Only suggest catalog lines that fit this preference (e.g. skip meat for vegetarian).`
      : ""

  const prompt = `You are a grocery shopping assistant. The customer is in a real marketplace: you MUST only suggest products that appear in the catalog list below (match by exact or very close product name).

Catalog (use ONLY these items when building the cart):
${lines}

Action: ${params.action}
${meals}
${diet}
User request: ${params.userMessage}

Return JSON only:
{
  "reply": "short friendly message to the user",
  "items": [ { "name": "string matching a catalog product name", "quantity": number } ]
}
Rules:
- Prefer fewer stores when possible; duplicate product names may exist at different stores — pick the first reasonable catalog line.
- For meal_plan / weekly_plan, expand meals into ingredient-style grocery items present in the catalog (e.g. rice, chicken, tomatoes).
- For chat, interpret the request (BBQ for 5, cheap weekly list, healthy low-calorie meals) and output practical grocery lines from the catalog.
- Max 40 items. Quantities are integers >= 1.`

  const ai = await analyzeWithAI("GENERAL_ANALYSIS" as AIUseCase, { action: params.action, message: params.userMessage }, {
    category: "TEXT_TO_TEXT",
    customPrompt: prompt,
    maxTokens: 2500,
    disableTools: true,
  })

  let parsed: { reply?: string; items?: Array<{ name: string; quantity: number }> } = { reply: "", items: [] }
  try {
    parsed = parseAiJson(ai.content || "{}")
  } catch {
    parsed = { reply: ai.content || "Could not parse plan.", items: [] }
  }

  const cartLines: Array<{
    productId: string
    name: string
    quantity: number
    storeId: string
    storeName: string
    unitPrice: number
    unit: string
  }> = []
  const unmatched: string[] = []
  const used = new Set<string>()

  for (const it of parsed.items || []) {
    const qty = Math.max(1, Math.min(99, Math.floor(Number(it.quantity) || 1)))
    const m = matchGroceryLineToProduct(String(it.name || ""), catalog)
    if (m && !used.has(m.id)) {
      used.add(m.id)
      cartLines.push({
        productId: m.id,
        name: m.name,
        quantity: qty,
        storeId: m.storeId,
        storeName: m.storeName,
        unitPrice: m.price,
        unit: m.unit,
      })
    } else if (!m) unmatched.push(String(it.name || ""))
  }

  return { reply: parsed.reply || "", cartLines, unmatched }
}

export async function runFoodSmartShopping(params: {
  latitude: number
  longitude: number
  maxKm?: number
  action: SmartAction
  userMessage: string
  selectedMeals?: string[]
  dietPreference?: string | null
}): Promise<{
  reply: string
  cartLines: Array<{
    menuItemId: string
    name: string
    quantity: number
    restaurantId: string
    restaurantName: string
    unitPrice: number
  }>
  unmatched: string[]
}> {
  const maxKm = params.maxKm ?? 25
  const catalog = await getNearbyFoodCatalog(params.latitude, params.longitude, maxKm, 280)
  if (catalog.length === 0) {
    return {
      reply: "No menu items are available near your location right now.",
      cartLines: [],
      unmatched: [],
    }
  }

  const lines = buildCatalogLinesFood(catalog)
  const meals =
    params.selectedMeals?.length && params.action === "meal_plan"
      ? `User-selected meals: ${params.selectedMeals.join(", ")}.`
      : ""

  const diet =
    params.dietPreference && String(params.dietPreference).trim()
      ? `Diet preference: ${String(params.dietPreference).trim()}. Only suggest catalog menu items that fit this preference.`
      : ""

  const prompt = `You are a food delivery assistant. Only suggest menu items that appear in the catalog below.

Catalog:
${lines}

Action: ${params.action}
${meals}
${diet}
User request: ${params.userMessage}

Return JSON only:
{
  "reply": "short friendly message",
  "items": [ { "name": "menu item name from catalog", "quantity": number } ]
}
Max 30 items. Match names to catalog entries.`

  const ai = await analyzeWithAI("GENERAL_ANALYSIS" as AIUseCase, { action: params.action, message: params.userMessage }, {
    category: "TEXT_TO_TEXT",
    customPrompt: prompt,
    maxTokens: 2200,
    disableTools: true,
  })

  let parsed: { reply?: string; items?: Array<{ name: string; quantity: number }> } = { reply: "", items: [] }
  try {
    parsed = parseAiJson(ai.content || "{}")
  } catch {
    parsed = { reply: ai.content || "", items: [] }
  }

  const cartLines: Array<{
    menuItemId: string
    name: string
    quantity: number
    restaurantId: string
    restaurantName: string
    unitPrice: number
  }> = []
  const unmatched: string[] = []
  const used = new Set<string>()

  for (const it of parsed.items || []) {
    const qty = Math.max(1, Math.min(99, Math.floor(Number(it.quantity) || 1)))
    const m = matchFoodLineToItem(String(it.name || ""), catalog)
    if (m && !used.has(m.id)) {
      used.add(m.id)
      cartLines.push({
        menuItemId: m.id,
        name: m.name,
        quantity: qty,
        restaurantId: m.restaurantId,
        restaurantName: m.restaurantName,
        unitPrice: m.price,
      })
    } else if (!m) unmatched.push(String(it.name || ""))
  }

  return { reply: parsed.reply || "", cartLines, unmatched }
}
