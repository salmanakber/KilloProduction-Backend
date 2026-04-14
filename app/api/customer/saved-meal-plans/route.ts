import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { scheduleMealPlanRecurringJob } from "@/lib/meal-plan-recurring-queue"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const module = (searchParams.get("module") || "").toUpperCase()
    const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") || "10")))

    const where: any = { userId: session.id, isActive: true }
    if (module === "FOOD" || module === "GROCERY") where.module = module

    const plans = await prisma.savedMealPlan.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
    })

    return NextResponse.json({ plans })
  } catch (e) {
    console.error("saved-meal-plans GET:", e)
    return NextResponse.json({ error: "Failed to load plans" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { module, title, planType, aiReply, items, meals, dietPreference, recurrenceIntervalDays } = body
    console.log("body", body)

    if (!module || !title || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "module, title, and items[] are required" }, { status: 400 })
    }

    const mod = String(module).toUpperCase()
    if (mod !== "FOOD" && mod !== "GROCERY") {
      return NextResponse.json({ error: "module must be FOOD or GROCERY" }, { status: 400 })
    }

    const ptRaw = String(planType || "WEEKLY").toUpperCase()
    const pt =
      ptRaw === "DAILY" ? "DAILY" : ptRaw === "EVERY_3_DAYS" ? "EVERY_3_DAYS" : "WEEKLY"

    const recurRaw =
      recurrenceIntervalDays != null && recurrenceIntervalDays !== ""
        ? Math.floor(Number(recurrenceIntervalDays))
        : 0
    const recur = recurRaw >= 1 && recurRaw <= 30 ? recurRaw : 0

    const plan = await prisma.savedMealPlan.create({
      data: {
        userId: session.id,
        module: mod as any,
        title: String(title).slice(0, 200),
        planType: pt,
        aiReply: typeof aiReply === "string" ? aiReply : null,
        items,
        meals: Array.isArray(meals) ? meals : null,
        dietPreference:
          typeof dietPreference === "string" ? String(dietPreference).slice(0, 32) : null,
        recurrenceIntervalDays: recur > 0 ? recur : null,
        nextRunAt: recur > 0 ? new Date(Date.now() + recur * 86400000) : null,
      },
    })

    if (recur > 0) {
      const ok = await scheduleMealPlanRecurringJob({
        planId: plan.id,
        delayMs: recur * 86400000,
      })
      if (!ok) {
        console.warn("[saved-meal-plans] recurrence not queued (REDIS_URL?)")
      }
    }

    return NextResponse.json({ plan }, { status: 201 })
  } catch (e) {
    console.error("saved-meal-plans POST:", e)
    return NextResponse.json({ error: "Failed to save plan" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const planId = searchParams.get("id")
    if (!planId) return NextResponse.json({ error: "id is required" }, { status: 400 })

    await prisma.savedMealPlan.updateMany({
      where: { id: planId, userId: session.id },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("saved-meal-plans DELETE:", e)
    return NextResponse.json({ error: "Failed to delete plan" }, { status: 500 })
  }
}
