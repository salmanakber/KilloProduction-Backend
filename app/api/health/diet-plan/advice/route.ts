import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { buildDietContext, generateDailyDietAdvice } from "@/lib/health-diet-ai"

// POST /api/health/diet-plan/advice — today's Smart AI dietary guidance
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const context = await buildDietContext(user.id, prisma, {
      localTime: body.localTime || new Date().toISOString(),
      timezone: body.timezone,
    })

    const advice = await generateDailyDietAdvice(context)

    const plan = await prisma.healthDietPlan.findFirst({
      where: { userId: user.id, isActive: true },
      orderBy: { updatedAt: "desc" },
    })

    if (plan) {
      await prisma.healthDietPlan.update({
        where: { id: plan.id },
        data: {
          dailyAdvice: { ...advice, generatedAt: new Date().toISOString() },
        },
      })
    }

    return NextResponse.json({ advice, generatedAt: new Date().toISOString() })
  } catch (e: any) {
    console.error("diet-plan/advice:", e)
    return NextResponse.json(
      { error: e?.message || "Could not generate dietary advice" },
      { status: 500 }
    )
  }
}
