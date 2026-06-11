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

function calendarDaysInclusive(start: Date, end: Date): number {
  const s = new Date(start)
  s.setHours(0, 0, 0, 0)
  const e = new Date(end)
  e.setHours(0, 0, 0, 0)
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1)
}

function computeStats(
  logs: { logType: string; value: unknown; recordedAt: Date }[],
  calendarDays?: number
) {
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
      const byDay = new Map<string, { steps: number; sessionSteps: number }>()
      for (const e of entries) {
        const day = e.recordedAt.toISOString().split('T')[0]
        const count = Number((e.value as any)?.count) || 0
        const source = (e.value as any)?.source
        const row = byDay.get(day) || { steps: 0, sessionSteps: 0 }
        if (source === 'activity_session') {
          row.sessionSteps += count
        } else {
          row.steps = Math.max(row.steps, count)
        }
        byDay.set(day, row)
      }
      const dailyBreakdown = Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, row]) => ({
          date,
          steps: row.steps + row.sessionSteps,
          pedometerSteps: row.steps,
          sessionSteps: row.sessionSteps,
        }))
      const totalSteps = dailyBreakdown.reduce((a, b) => a + b.steps, 0)
      const activeDays = dailyBreakdown.filter((d) => d.steps > 0).length
      const divisor = calendarDays && calendarDays > 0 ? calendarDays : dailyBreakdown.length || 1
      stats[type] = {
        ...stats[type],
        dailyBreakdown,
        totalSteps,
        activeDays,
        avgSteps: Math.round(totalSteps / divisor),
      }
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

const GENERAL_PROMPT = `You are a friendly health coach. Analyze the user's health data and write a clear, helpful health report.
Use plain language. Be specific about their numbers when available.
For STEPS: use stats.STEPS.dailyBreakdown and activityContext.dailySteps — each calendar day in the period has its own step count. Use activityContext.todaySteps ONLY for today. If activeDays is 0 or all daily steps are 0, say the user had little or no recorded activity in the period — do NOT invent step counts or reuse a single old entry as today's total.

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
}`

const SLEEP_PROMPT = `You are a sleep and recovery coach. Write a focused sleep report ONLY — do not discuss diet, workouts, or unrelated health topics unless directly tied to sleep quality.

Use stats.SLEEP, stats.WATER_INTAKE, and sleepContext from the payload. If sleep data is missing, say so and suggest logging sleep for a few nights.

Return ONLY valid JSON:
{
  "score": 0-100,
  "assessment": "2-3 sentence sleep quality summary",
  "explanations": [
    "What their sleep duration/pattern means",
    "How hydration or routine may affect rest",
    "Optional third sleep-specific insight"
  ],
  "highlights": ["positive sleep habit 1", "positive sleep habit 2"],
  "trends": {
    "sleep": "stable|improving|declining|insufficient_data",
    "hydration": "stable|improving|declining|insufficient_data"
  },
  "concerns": ["sleep concern or empty array"],
  "recommendations": ["sleep-only tip 1", "sleep-only tip 2", "sleep-only tip 3"],
  "motivational": "One encouraging closing sentence about rest and recovery"
}

Do NOT include dietAnalysis. Do NOT mention steps, calories, or meal planning.`

// POST /api/health/analyze – on-demand AI health report (does not save summary)
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const period = (body.period || 'DAILY').toUpperCase()
    const activityContext = body.activityContext || null
    const focusModule = String(body.focusModule || activityContext?.focusModule || 'general').toLowerCase()
    const isSleepReport = focusModule === 'sleep'

    const now = new Date()
    const startDate = new Date(now)
    if (period === 'DAILY') {
      startDate.setHours(0, 0, 0, 0)
    } else if (period === 'THREE_DAY') startDate.setDate(startDate.getDate() - 2)
    else if (period === 'WEEKLY') startDate.setDate(startDate.getDate() - 6)
    else if (period === 'MONTHLY') startDate.setMonth(startDate.getMonth() - 1)
    else if (period === 'YEARLY') startDate.setFullYear(startDate.getFullYear() - 1)
    else startDate.setMonth(startDate.getMonth() - 1)

    const calendarDays = calendarDaysInclusive(startDate, now)

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

    const relevantLogs = isSleepReport
      ? logs.filter((l) => l.logType === 'SLEEP' || l.logType === 'WATER_INTAKE')
      : logs

    const stats = computeStats(relevantLogs, calendarDays)
    const dietLogs = isSleepReport ? [] : logs.filter((l) => l.logType === 'DIET')
    const dietStats = dietLogs.length > 0 ? buildDietStats(dietLogs) : null

    const aiPayload = {
      period,
      focusModule,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      calendarDays,
      userVitals: isSleepReport ? null : vitals,
      stats,
      dietStats,
      sleepContext: isSleepReport ? activityContext : null,
      activityContext: isSleepReport ? null : activityContext,
      labResults: isSleepReport ? [] : labResults.slice(0, 5),
      doctorVisits: isSleepReport ? [] : doctorVisits.slice(0, 5),
      activeMedications: isSleepReport ? [] : reminders,
      totalLogEntries: relevantLogs.length,
    }

    let report: Record<string, unknown> | null = null
    try {
      const aiResponse = await analyzeWithAI('GENERAL_ANALYSIS' as AIUseCase, aiPayload, {
        category: 'TEXT_TO_TEXT',
        customPrompt: isSleepReport ? SLEEP_PROMPT : GENERAL_PROMPT,
      })

      if (aiResponse.content) {
        let cleaned = aiResponse.content.trim()
        cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
        const first = cleaned.indexOf('{')
        const last = cleaned.lastIndexOf('}')
        if (first !== -1 && last !== -1) cleaned = cleaned.substring(first, last + 1)
        report = JSON.parse(cleaned)
        if (isSleepReport && report) {
          delete report.dietAnalysis
        }
      }
    } catch (aiErr) {
      console.error('AI health analyze failed:', aiErr)
    }

    if (!report) {
      if (isSleepReport) {
        const sleepStats = stats.SLEEP as { count?: number } | undefined
        const avgHours = activityContext?.avgSleepHours ?? 0
        report = {
          score: avgHours >= 7 ? 75 : avgHours >= 6 ? 55 : 40,
          assessment: sleepStats?.count
            ? `You logged ${sleepStats.count} night(s) of sleep with an average of about ${avgHours} hours.`
            : 'Log your sleep for a few nights to receive a personalized sleep report.',
          explanations: [
            avgHours > 0
              ? `Averaging ${avgHours} hours per night — most adults benefit from 7–9 hours of rest.`
              : 'Track bedtime and wake time to spot patterns in your rest.',
            activityContext?.avgWaterGlasses
              ? `Hydration averaged ${activityContext.avgWaterGlasses} glasses — staying hydrated supports better sleep quality.`
              : 'Evening hydration and a consistent wind-down routine can improve sleep quality.',
          ],
          highlights: avgHours >= 7 ? ['Solid sleep duration logged'] : [],
          trends: { sleep: sleepStats?.count ? 'stable' : 'insufficient_data', hydration: 'insufficient_data' },
          concerns: avgHours > 0 && avgHours < 6 ? ['Sleep duration may be below recommended levels'] : [],
          recommendations: [
            'Keep a consistent bedtime and wake time, even on weekends.',
            'Limit screens 30–60 minutes before bed.',
            'Log sleep nightly so trends become clearer over time.',
          ],
          motivational: 'Better rest starts with small, consistent habits — one good night at a time.',
        }
      } else {
        report = {
          score: activityContext?.goalProgress?.[0]?.percent ?? 50,
          assessment: 'We could not reach the AI service right now. Here is a snapshot based on your logged data.',
          explanations: [
            activityContext?.dailySteps?.length
              ? `Over the last ${activityContext.dailySteps.length} day(s), you averaged ${activityContext.avgSteps ?? 0} steps/day (${activityContext.periodTotalSteps ?? 0} total, ${activityContext.activeDays ?? 0} active day(s)). Today's logged steps: ${activityContext.todaySteps ?? 0}.`
              : activityContext
                ? `Today's logged steps: ${activityContext.todaySteps ?? 0}. Period total: ${activityContext.periodTotalSteps ?? 0}.`
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
    }

    return NextResponse.json({
      report,
      meta: {
        period,
        focusModule,
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
