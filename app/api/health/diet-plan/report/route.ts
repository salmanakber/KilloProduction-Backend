import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { buildDietContext, generateDietReportWithAI } from "@/lib/health-diet-ai"

// POST /api/health/diet-plan/report — on-demand AI diet analysis report
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const context = await buildDietContext(user.id, prisma, {
      period: body.period || "WEEKLY",
      activityContext: body.activityContext || null,
    })

    const report = await generateDietReportWithAI(context)

    const plan = await prisma.healthDietPlan.findFirst({
      where: { userId: user.id, isActive: true },
      orderBy: { updatedAt: "desc" },
    })

    if (plan) {
      await prisma.healthDietPlan.update({
        where: { id: plan.id },
        data: {
          aiReport: { ...report, generatedAt: new Date().toISOString() },
        },
      })
    }

    return NextResponse.json({ report, generatedAt: new Date().toISOString() })
  } catch (e: any) {
    console.error("diet-plan/report:", e)
    return NextResponse.json(
      { error: e?.message || "Could not generate diet report" },
      { status: 500 }
    )
  }
}
