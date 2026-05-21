import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { normalizeMeals } from "@/lib/health-diet-ai"

async function deactivateOtherPlans(userId: string, keepId?: string) {
  await prisma.healthDietPlan.updateMany({
    where: { userId, isActive: true, ...(keepId ? { id: { not: keepId } } : {}) },
    data: { isActive: false },
  })
}

// GET active plan | POST save manual plan | PATCH update plan
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const plan = await prisma.healthDietPlan.findFirst({
      where: { userId: user.id, isActive: true },
      orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json({ plan })
  } catch (e) {
    console.error("diet-plan GET:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const meals = normalizeMeals(body.meals)

    await deactivateOtherPlans(user.id)

    const plan = await prisma.healthDietPlan.create({
      data: {
        userId: user.id,
        title: String(body.title || "My Diet Plan").slice(0, 120),
        source: body.source === "AI" ? "AI" : "MANUAL",
        calorieGoal: Math.max(800, Number(body.calorieGoal) || 2000),
        proteinGoal: body.proteinGoal != null ? Number(body.proteinGoal) : null,
        carbsGoal: body.carbsGoal != null ? Number(body.carbsGoal) : null,
        fatGoal: body.fatGoal != null ? Number(body.fatGoal) : null,
        dietPreference: body.dietPreference ? String(body.dietPreference).slice(0, 64) : null,
        restrictions: body.restrictions ? String(body.restrictions).slice(0, 500) : null,
        meals,
        remindersEnabled: body.remindersEnabled !== false,
        isActive: true,
      },
    })

    return NextResponse.json({ plan }, { status: 201 })
  } catch (e) {
    console.error("diet-plan POST:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const existing = await prisma.healthDietPlan.findFirst({
      where: { userId: user.id, isActive: true },
      orderBy: { updatedAt: "desc" },
    })
    if (!existing) return NextResponse.json({ error: "No active plan" }, { status: 404 })

    const plan = await prisma.healthDietPlan.update({
      where: { id: existing.id },
      data: {
        ...(body.title != null ? { title: String(body.title).slice(0, 120) } : {}),
        ...(body.calorieGoal != null ? { calorieGoal: Math.max(800, Number(body.calorieGoal)) } : {}),
        ...(body.proteinGoal != null ? { proteinGoal: Number(body.proteinGoal) } : {}),
        ...(body.carbsGoal != null ? { carbsGoal: Number(body.carbsGoal) } : {}),
        ...(body.fatGoal != null ? { fatGoal: Number(body.fatGoal) } : {}),
        ...(body.dietPreference != null ? { dietPreference: String(body.dietPreference).slice(0, 64) } : {}),
        ...(body.restrictions != null ? { restrictions: String(body.restrictions).slice(0, 500) } : {}),
        ...(body.meals != null ? { meals: normalizeMeals(body.meals) } : {}),
        ...(body.remindersEnabled != null ? { remindersEnabled: !!body.remindersEnabled } : {}),
        ...(body.isActive === false ? { isActive: false } : {}),
      },
    })

    return NextResponse.json({ plan })
  } catch (e) {
    console.error("diet-plan PATCH:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
