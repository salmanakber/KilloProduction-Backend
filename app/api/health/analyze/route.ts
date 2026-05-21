import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { analyzeWithAI } from '@/lib/ai/queue'
import { AIUseCase } from '@prisma/client'

function buildDietStats(logs: { value: unknown; recordedAt: Date }[]) {
  const meals = logs.map((l) => l.value as Record<string, unknown>)
  const totals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + (Number(m.calories) || 0),
      protein: acc.protein + (Number(m.protein) || 0),
      carbs: acc.carbs + (Number(m.carbs) || 0),
      fat: acc.fat + (Number(m.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
  return {
    mealCount: meals.length,
    totals,
    meals: meals.map((m) => ({
      mealName: m.mealName,
      mealType: m.mealType,
      calories: m.calories,
      protein: m.protein,
      carbs: m.carbs,
      fat: m.fat,
    })),
  }
}

function computeStats(logs: { logType: string; value: unknown; recordedAt: Date }[]) {
  const grouped: Record<string, typeof logs> = {}
  for (const log of logs) {
    if (!grouped[log.logType]) grouped[log.logType] = []
    grouped[log.logType].push(log)
  }

  const stats: Record<string, unknown> = {}
  for (const [type, entries] of Object.entries(grouped)) {
    stats[type] = {
      count: entries.length,
      entries: entries.map((e) => ({ value: e.value, recordedAt: e.recordedAt })),
    }
    if (type === 'STEPS') {
      const steps = entries.map((e) => Number((e.value as any)?.count)).filter(Boolean)
      stats[type] = { ...stats[type], totalSteps: steps.reduce((a, b) => a + b, 0), avgSteps: steps.length ? Math.round(steps.reduce((a, b) => a + b, 0) / steps.length) : 0 }
    }
    if (type === 'DIET') {
      stats[type] = { ...stats[type], ...buildDietStats(entries) }
    }
    if (type === 'BLOOD_PRESSURE') {
      const systolics = entries.map((e) => Number((e.value as any)?.systolic)).filter(Boolean)
      const diastolics = entries.map((e) => Number((e.value as any)?.diastolic)).filter(Boolean)
      stats[type] = {
        ...stats[type],
        avgSystolic: systolics.length ? Math.round(systolics.reduce((a, b) => a + b, 0) / systolics.length) : null,
        avgDiastolic: diastolics.length ? Math.round(diastolics.reduce((a, b) => a + b, 0) / diastolics.length) : null,
      }
    }
    if (type === 'WEIGHT') {
      const weights = entries.map((e) => Number((e.value as any)?.kg)).filter(Boolean)
      stats[type] = { ...stats[type], latestWeight: weights.length ? weights[weights.length - 1] : null }
    }
  }
  return stats
}

// POST /api/health/analyze – on-demand AI health report (does not save summary)
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const period = (body.period || 'DAILY').toUpperCase()
    const activityContext = body.activityContext || null

    const now = new Date()
    const startDate = new Date(now)
    if (period === 'DAILY') startDate.setDate(startDate.getDate() - 1)
    else if (period === 'WEEKLY') startDate.setDate(startDate.getDate() - 7)
    else startDate.setMonth(startDate.getMonth() - 1)

    const [logs, vitals, reminders, labResults, doctorVisits] = await Promise.all([
      prisma.healthLog.findMany({
        where: { userId: user.id, recordedAt: { gte: startDate, lte: now } },
        orderBy: { recordedAt: 'asc' },
      }),
      prisma.healthVital.findUnique({ where: { userId: user.id } }),
      prisma.medicineReminder.findMany({
        where: { userId: user.id, isActive: true },
        select: { medicineName: true, dosage: true, frequency: true },
      }),
      prisma.healthLabResult.findMany({
        where: { userId: user.id, testedAt: { gte: startDate, lte: now } },
        orderBy: { testedAt: 'asc' },
      }),
      prisma.doctorVisit.findMany({
        where: { userId: user.id, visitedAt: { gte: startDate, lte: now } },
        orderBy: { visitedAt: 'asc' },
      }),
    ])

    const stats = computeStats(logs)
    const dietLogs = logs.filter((l) => l.logType === 'DIET')
    const dietStats = dietLogs.length > 0 ? buildDietStats(dietLogs) : null

    const aiPayload = {
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      userVitals: vitals,
      stats,
      dietStats,
      activityContext,
      labResults: labResults.slice(0, 5),
      doctorVisits: doctorVisits.slice(0, 5),
      activeMedications: reminders,
      totalLogEntries: logs.length,
    }

    let report: Record<string, unknown> | null = null
    try {
      const aiResponse = await analyzeWithAI('GENERAL_ANALYSIS' as AIUseCase, aiPayload, {
        category: 'TEXT_TO_TEXT',
        customPrompt: `You are a friendly health coach. Analyze the user's health data and write a clear, helpful health report.
Use plain language. Be specific about their numbers when available.

Return ONLY valid JSON:
{
  "score": 0-100,
  "assessment": "2-3 sentence overall health summary",
  "explanations": [
    "Plain-language explanation of what their activity/vitals mean",
    "Another easy-to-understand insight about trends or habits",
    "Optional third explanation about diet, sleep, or medications"
  ],
  "highlights": ["positive finding 1", "positive finding 2"],
  "trends": {
    "activity": "stable|improving|declining|insufficient_data",
    "nutrition": "stable|improving|declining|insufficient_data",
    "vitals": "stable|improving|declining|insufficient_data"
  },
  "dietAnalysis": {
    "summary": "Brief nutrition assessment based on logged meals",
    "calorieBalance": "under|balanced|over|unknown",
    "suggestions": ["actionable diet tip 1", "actionable diet tip 2"]
  },
  "concerns": ["any concern or empty array"],
  "recommendations": ["actionable recommendation 1", "actionable recommendation 2", "actionable recommendation 3"],
  "motivational": "One encouraging closing sentence"
}`,
      })

      if (aiResponse.content) {
        let cleaned = aiResponse.content.trim()
        cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
        const first = cleaned.indexOf('{')
        const last = cleaned.lastIndexOf('}')
        if (first !== -1 && last !== -1) cleaned = cleaned.substring(first, last + 1)
        report = JSON.parse(cleaned)
      }
    } catch (aiErr) {
      console.error('AI health analyze failed:', aiErr)
    }

    if (!report) {
      report = {
        score: activityContext?.goalProgress?.[0]?.percent ?? 50,
        assessment: 'We could not reach the AI service right now. Here is a snapshot based on your logged data.',
        explanations: [
          activityContext
            ? `You logged ${activityContext.steps?.toLocaleString?.() ?? activityContext.steps ?? 0} steps recently. Regular walking supports heart health and energy.`
            : 'Log activity and meals to get personalized insights.',
          dietStats
            ? `You logged ${dietStats.mealCount} meal(s) with about ${dietStats.totals.calories} total calories in this period.`
            : 'Track meals in the Diet section to receive nutrition guidance.',
        ],
        highlights: [],
        trends: { activity: 'insufficient_data', nutrition: dietStats ? 'stable' : 'insufficient_data', vitals: 'insufficient_data' },
        dietAnalysis: {
          summary: dietStats ? `Total intake: ~${dietStats.totals.calories} kcal across ${dietStats.mealCount} meals.` : 'No meals logged yet.',
          calorieBalance: 'unknown',
          suggestions: ['Log breakfast, lunch, and dinner to improve nutrition insights.'],
        },
        concerns: [],
        recommendations: ['Keep logging vitals and meals daily.', 'Aim for consistent sleep and hydration.'],
        motivational: 'Small daily habits lead to lasting health improvements.',
      }
    }

    return NextResponse.json({
      report,
      meta: {
        period,
        startDate,
        endDate: now,
        stats,
        dietStats,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Error in health analyze:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
