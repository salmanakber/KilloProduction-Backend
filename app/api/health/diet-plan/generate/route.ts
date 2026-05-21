import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import {
  buildDietContext,
  generateDietPlanWithAI,
  normalizeMeals,
} from "@/lib/health-diet-ai"

// POST /api/health/diet-plan/generate — AI creates a personalized meal plan
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const context = await buildDietContext(user.id, prisma, {
      calorieGoal: body.calorieGoal,
      dietPreference: body.dietPreference,
      restrictions: body.restrictions,
      goals: body.goals,
    })

    const aiPlan = await generateDietPlanWithAI(context)
    const meals = normalizeMeals(aiPlan.meals)

    await prisma.healthDietPlan.updateMany({
      where: { userId: user.id, isActive: true },
      data: { isActive: false },
    })

    const plan = await prisma.healthDietPlan.create({
      data: {
        userId: user.id,
        title: String(aiPlan.title || "AI Diet Plan").slice(0, 120),
        source: "AI",
        calorieGoal: Math.max(800, Number(aiPlan.calorieGoal) || Number(body.calorieGoal) || 2000),
        proteinGoal: aiPlan.proteinGoal != null ? Number(aiPlan.proteinGoal) : null,
        carbsGoal: aiPlan.carbsGoal != null ? Number(aiPlan.carbsGoal) : null,
        fatGoal: aiPlan.fatGoal != null ? Number(aiPlan.fatGoal) : null,
        dietPreference: body.dietPreference ? String(body.dietPreference).slice(0, 64) : null,
        restrictions: body.restrictions ? String(body.restrictions).slice(0, 500) : null,
        meals,
        remindersEnabled: true,
        isActive: true,
        aiReport: { summary: aiPlan.summary, tips: aiPlan.tips, generatedAt: new Date().toISOString() },
      },
    })

    return NextResponse.json({
      plan,
      aiMeta: { summary: aiPlan.summary, tips: aiPlan.tips },
    })
  } catch (e: any) {
    console.error("diet-plan/generate:", e)
    return NextResponse.json(
      { error: e?.message || "Could not generate diet plan" },
      { status: 500 }
    )
  }
}
