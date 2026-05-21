import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { analyzeWithAI } from '@/lib/ai/queue'
import { AIUseCase } from '@prisma/client'

// GET /api/health/summary?period=DAILY|WEEKLY|MONTHLY&from=...&to=...
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'WEEKLY'

    const summaries = await prisma.healthSummary.findMany({
      where: { userId: user.id, period: period as any },
      orderBy: { startDate: 'desc' },
      take: 10,
    })

    return NextResponse.json({ summaries })
  } catch (error) {
    console.error('Error fetching health summaries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/health/summary – generate AI summary for a period
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { period = 'WEEKLY', from, to, activityContext } = body

    // Calculate date range
    const now = new Date()
    let startDate: Date
    let endDate: Date = to ? new Date(to) : now

    if (from) {
      startDate = new Date(from)
    } else {
      startDate = new Date(now)
      if (period === 'DAILY') {
        startDate.setDate(startDate.getDate() - 1)
      } else if (period === 'WEEKLY') {
        startDate.setDate(startDate.getDate() - 7)
      } else {
        startDate.setMonth(startDate.getMonth() - 1)
      }
    }

    // Fetch all health data for the period
    const [logs, vitals, reminders, labResults, doctorVisits] = await Promise.all([
      prisma.healthLog.findMany({
        where: { userId: user.id, recordedAt: { gte: startDate, lte: endDate } },
        orderBy: { recordedAt: 'asc' },
      }),
      prisma.healthVital.findUnique({ where: { userId: user.id } }),
      prisma.medicineReminder.findMany({
        where: { userId: user.id, isActive: true },
        select: { medicineName: true, dosage: true, frequency: true },
      }),
      prisma.healthLabResult.findMany({
        where: { userId: user.id, testedAt: { gte: startDate, lte: endDate } },
        orderBy: { testedAt: 'asc' },
      }),
      prisma.doctorVisit.findMany({
        where: { userId: user.id, visitedAt: { gte: startDate, lte: endDate } },
        orderBy: { visitedAt: 'asc' },
      }),
    ])

    // Calculate averages for each log type
    const groupedLogs: Record<string, any[]> = {}
    for (const log of logs) {
      if (!groupedLogs[log.logType]) groupedLogs[log.logType] = []
      groupedLogs[log.logType].push(log)
    }

    const stats: any = {}
    for (const [type, entries] of Object.entries(groupedLogs)) {
      stats[type] = {
        count: entries.length,
        entries: entries.map(e => ({ value: e.value, recordedAt: e.recordedAt })),
      }

      // Compute averages for numeric types
      if (type === 'BLOOD_PRESSURE') {
        const systolics = entries.map(e => Number((e.value as any)?.systolic)).filter(Boolean)
        const diastolics = entries.map(e => Number((e.value as any)?.diastolic)).filter(Boolean)
        stats[type].avgSystolic = systolics.length ? Math.round(systolics.reduce((a, b) => a + b, 0) / systolics.length) : null
        stats[type].avgDiastolic = diastolics.length ? Math.round(diastolics.reduce((a, b) => a + b, 0) / diastolics.length) : null
      }
      if (type === 'BLOOD_SUGAR') {
        const levels = entries.map(e => Number((e.value as any)?.level)).filter(Boolean)
        stats[type].avgLevel = levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : null
      }
      if (type === 'STEPS') {
        const steps = entries.map(e => Number((e.value as any)?.count)).filter(Boolean)
        stats[type].totalSteps = steps.reduce((a, b) => a + b, 0)
        stats[type].avgSteps = steps.length ? Math.round(stats[type].totalSteps / steps.length) : 0
      }
      if (type === 'WEIGHT') {
        const weights = entries.map(e => Number((e.value as any)?.kg)).filter(Boolean)
        stats[type].latestWeight = weights.length ? weights[weights.length - 1] : null
        stats[type].avgWeight = weights.length ? (weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(1) : null
      }
      if (type === 'BODY_TEMPERATURE') {
        const temps = entries.map(e => Number((e.value as any)?.celsius)).filter(Boolean)
        stats[type].avgTemp = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : null
      }
      if (type === 'DIET') {
        const meals = entries.map(e => e.value as any)
        const totals = meals.reduce(
          (acc, m) => ({
            calories: acc.calories + (Number(m?.calories) || 0),
            protein: acc.protein + (Number(m?.protein) || 0),
            carbs: acc.carbs + (Number(m?.carbs) || 0),
            fat: acc.fat + (Number(m?.fat) || 0),
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 }
        )
        stats[type].mealCount = meals.length
        stats[type].totals = totals
      }
    }
    console.log('stats', stats)

    // Generate AI summary
    let aiSummary = ''
    try {
      const aiData = {
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        userVitals: vitals,
        stats,
        labResults,
        doctorVisits,
        activeMedications: reminders,
        totalLogEntries: logs.length,
        activityContext: activityContext || null,
      }
      console.log('aiData', aiData)

      const aiResponse = await analyzeWithAI('GENERAL_ANALYSIS' as AIUseCase, aiData, {
        category: 'TEXT_TO_TEXT',
        customPrompt: `You are a health analytics assistant. Analyze the following health data for a ${period.toLowerCase()} summary.
Include activity, vitals, diet/nutrition (DIET logs), sleep, and medications when present.
Provide:
1. A brief overall health assessment
2. Plain-language explanations (2-3 sentences each) of what the data means
3. Key statistics and averages
4. Notable trends or patterns
5. Diet and nutrition analysis if meals are logged
6. Any concerns or irregularities
7. Actionable recommendations

Return JSON: { "assessment": "...", "explanations": ["..."], "highlights": ["..."], "trends": { "activity": "...", "nutrition": "...", "vitals": "..." }, "dietAnalysis": { "summary": "...", "suggestions": ["..."] }, "concerns": ["..."], "recommendations": ["..."], "score": 0-100, "motivational": "..." }`,
      })

      if (aiResponse.content) {
        try {
          let cleaned = aiResponse.content.trim()
          cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
          const first = cleaned.indexOf('{')
          const last = cleaned.lastIndexOf('}')
          if (first !== -1 && last !== -1) cleaned = cleaned.substring(first, last + 1)
          aiSummary = JSON.parse(cleaned)
        } catch {
          aiSummary = aiResponse.content
        }
      }
    } catch (aiErr) {
      console.error('AI summary generation failed:', aiErr)
      aiSummary = ''
    }

    

    // Store the summary
    const summary = await prisma.healthSummary.create({
      data: {
        userId: user.id,
        period: period as any,
        startDate,
        endDate,
        summary: {
          stats,
          aiSummary,
          labResults: labResults.length,
          doctorVisits: doctorVisits.length,
          activeMedications: reminders.length,
          totalLogEntries: logs.length,
          generatedAt: new Date().toISOString(),
        },
      },
    })

    return NextResponse.json({ summary })
  } catch (error) {
    console.error('Error generating health summary:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
