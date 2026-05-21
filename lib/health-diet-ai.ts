import { analyzeWithAI } from "@/lib/ai/queue"
import { AIUseCase } from "@prisma/client"

export type PlannedMeal = {
  id: string
  mealType: "breakfast" | "lunch" | "dinner" | "snack"
  name: string
  time: string
  calories: number
  protein?: number
  carbs?: number
  fat?: number
  foods?: string[]
  notes?: string
}

export function parseAiJson(content: string): Record<string, unknown> {
  let cleaned = content.trim()
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/i, "")
  const first = cleaned.indexOf("{")
  const last = cleaned.lastIndexOf("}")
  if (first !== -1 && last !== -1) cleaned = cleaned.substring(first, last + 1)
  return JSON.parse(cleaned)
}

export function normalizeMeals(raw: unknown): PlannedMeal[] {
  if (!Array.isArray(raw)) return []
  return raw.map((m: any, i) => ({
    id: String(m?.id || `meal_${i}_${Date.now()}`),
    mealType: ["breakfast", "lunch", "dinner", "snack"].includes(m?.mealType) ? m.mealType : "lunch",
    name: String(m?.name || "Meal"),
    time: String(m?.time || "12:00").slice(0, 5),
    calories: Math.max(0, Number(m?.calories) || 0),
    protein: m?.protein != null ? Number(m.protein) : undefined,
    carbs: m?.carbs != null ? Number(m.carbs) : undefined,
    fat: m?.fat != null ? Number(m.fat) : undefined,
    foods: Array.isArray(m?.foods) ? m.foods.map(String) : undefined,
    notes: m?.notes ? String(m.notes) : undefined,
  }))
}

export async function buildDietContext(userId: string, prisma: any, extra?: Record<string, unknown>) {
  const [vitals, dietLogs, plan] = await Promise.all([
    prisma.healthVital.findUnique({ where: { userId } }),
    prisma.healthLog.findMany({
      where: { userId, logType: "DIET", recordedAt: { gte: new Date(Date.now() - 7 * 86400000) } },
      orderBy: { recordedAt: "desc" },
      take: 30,
    }),
    prisma.healthDietPlan.findFirst({ where: { userId, isActive: true }, orderBy: { updatedAt: "desc" } }),
  ])

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayMeals = dietLogs.filter((l: any) => new Date(l.recordedAt) >= todayStart)

  return {
    vitals,
    recentDietLogs: dietLogs.map((l: any) => ({ value: l.value, recordedAt: l.recordedAt })),
    todayMealsLogged: todayMeals.length,
    activePlan: plan
      ? {
          title: plan.title,
          calorieGoal: plan.calorieGoal,
          proteinGoal: plan.proteinGoal,
          carbsGoal: plan.carbsGoal,
          fatGoal: plan.fatGoal,
          dietPreference: plan.dietPreference,
          meals: plan.meals,
        }
      : null,
    ...extra,
  }
}

/** AI generates a full daily meal schedule with times and macros */
export async function generateDietPlanWithAI(context: Record<string, unknown>) {
  const aiResponse = await analyzeWithAI("AI_DOCTOR" as AIUseCase, context, {
    category: "TEXT_TO_TEXT",
    disableTools: true,
    maxTokens: 4096,
    customPrompt: `You are a certified nutrition coach. Create a personalized daily diet plan.

User context:
${JSON.stringify(context, null, 2)}

Rules:
- Include breakfast, lunch, dinner, and optionally 1 snack
- Each meal needs a specific time in 24h format (HH:mm)
- Respect diet preference, allergies, chronic conditions, and restrictions
- Keep calories aligned with calorieGoal when provided
- Use realistic, culturally neutral meal names

Return ONLY valid JSON:
{
  "title": "Plan title",
  "calorieGoal": number,
  "proteinGoal": number,
  "carbsGoal": number,
  "fatGoal": number,
  "summary": "2 sentence plan overview",
  "meals": [
    {
      "id": "breakfast_1",
      "mealType": "breakfast|lunch|dinner|snack",
      "name": "Meal name",
      "time": "08:00",
      "calories": 400,
      "protein": 25,
      "carbs": 45,
      "fat": 12,
      "foods": ["item 1", "item 2"],
      "notes": "optional tip"
    }
  ],
  "tips": ["daily habit tip 1", "tip 2"]
}`,
  })

  if (!aiResponse.content) throw new Error("Empty AI response")
  return parseAiJson(aiResponse.content)
}

/** Short daily dietary advice for today */
export async function generateDailyDietAdvice(context: Record<string, unknown>) {
  const aiResponse = await analyzeWithAI("AI_DOCTOR" as AIUseCase, context, {
    category: "TEXT_TO_TEXT",
    disableTools: true,
    maxTokens: 2048,
    customPrompt: `You are a friendly nutrition coach. Give today's dietary guidance based on the user's plan, logged meals, and profile.

Context:
${JSON.stringify(context, null, 2)}

Return ONLY valid JSON:
{
  "headline": "Short catchy title for today",
  "summary": "2-3 sentences of personalized advice for today",
  "explanations": [
    "Plain language explanation of why this matters",
    "Another helpful insight"
  ],
  "mealReminders": [
    { "mealType": "breakfast", "time": "08:00", "suggestion": "What to eat and why" },
    { "mealType": "lunch", "time": "13:00", "suggestion": "..." }
  ],
  "hydrationTip": "One hydration tip",
  "avoidToday": ["optional food to limit today"],
  "focusToday": ["priority 1", "priority 2"]
}`,
  })

  if (!aiResponse.content) throw new Error("Empty AI response")
  return parseAiJson(aiResponse.content)
}

/** Full diet report — manual/on-demand analysis */
export async function generateDietReportWithAI(context: Record<string, unknown>) {
  const aiResponse = await analyzeWithAI("GENERAL_ANALYSIS" as AIUseCase, context, {
    category: "TEXT_TO_TEXT",
    disableTools: true,
    maxTokens: 3072,
    customPrompt: `You are a health analytics assistant specializing in nutrition. Analyze the user's diet data and produce a detailed diet report.

Context:
${JSON.stringify(context, null, 2)}

Return ONLY valid JSON:
{
  "score": 0-100,
  "assessment": "Overall nutrition assessment (2-3 sentences)",
  "explanations": [
    "What their eating pattern means in plain language",
    "Macro/calorie balance explanation",
    "Optional third insight"
  ],
  "highlights": ["positive finding"],
  "concerns": ["concern or empty"],
  "recommendations": ["actionable tip 1", "tip 2", "tip 3"],
  "weeklyFocus": "One paragraph on what to focus on this week",
  "sampleDayPlan": {
    "breakfast": "Suggestion",
    "lunch": "Suggestion",
    "dinner": "Suggestion",
    "snack": "Suggestion"
  }
}`,
  })

  if (!aiResponse.content) throw new Error("Empty AI response")
  return parseAiJson(aiResponse.content)
}
