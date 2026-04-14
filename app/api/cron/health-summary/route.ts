import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { NotificationBridge } from '@/lib/notification-bridge'
import { analyzeWithAI } from '@/lib/ai/queue'
import { AIUseCase } from '@prisma/client'

/**
 * CRON: Daily Health Summary
 * Runs once per day (e.g. 8 AM) to:
 * 1. Generate daily AI summaries for active users
 * 2. Send notifications with health insights
 * 3. Detect irregularities and alert users
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    

    const now = new Date()
    const yesterdayStart = new Date(now)
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    yesterdayStart.setHours(0, 0, 0, 0)

    const yesterdayEnd = new Date(now)
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1)
    yesterdayEnd.setHours(23, 59, 59, 999)

    // Find users who logged health data yesterday
    const activeUsers = await prisma.healthLog.findMany({
      where: {
        recordedAt: { gte: yesterdayStart, lte: yesterdayEnd },
      },
      select: { userId: true },
      distinct: ['userId'],
    })
    console.log('activeUsers', activeUsers)

    let summariesGenerated = 0
    let notificationsSent = 0

    for (const { userId } of activeUsers) {
      try {
        // Fetch yesterday's logs
        const logs = await prisma.healthLog.findMany({
          where: { userId, recordedAt: { gte: yesterdayStart, lte: yesterdayEnd } },
          orderBy: { recordedAt: 'asc' },
        })

        if (logs.length === 0) continue

        const vitals = await prisma.healthVital.findUnique({ where: { userId } })
        console.log('vitals', vitals)
        // Build stats
        const grouped: Record<string, any[]> = {}
        for (const log of logs) {
          if (!grouped[log.logType]) grouped[log.logType] = []
          grouped[log.logType].push(log.value)
        }

        const stats: Record<string, any> = {}
        for (const [type, values] of Object.entries(grouped)) {
          stats[type] = { count: values.length, values }
        }

        // AI summary
        let aiSummary: any = null
        try {
          const aiResponse = await analyzeWithAI('GENERAL_ANALYSIS' as AIUseCase, {
            period: 'DAILY',
            userVitals: vitals,
            stats,
            date: yesterdayStart.toISOString().split('T')[0],
          }, {
            category: 'TEXT_TO_TEXT',
            customPrompt: `You are a health assistant. Summarize yesterday's health data briefly.
Return JSON: { "summary": "One paragraph summary", "highlights": ["key point 1", "key point 2"], "concerns": ["any concerns"], "score": 0-100 }`,
          })

          if (aiResponse.content) {
            let cleaned = aiResponse.content.trim()
            cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
            const first = cleaned.indexOf('{')
            const last = cleaned.lastIndexOf('}')
            if (first !== -1 && last !== -1) cleaned = cleaned.substring(first, last + 1)
            aiSummary = JSON.parse(cleaned)
          }
        } catch { /* AI not critical */ }

        // Store summary
        await prisma.healthSummary.create({
          data: {
            userId,
            period: 'DAILY',
            startDate: yesterdayStart,
            endDate: yesterdayEnd,
            summary: { stats, aiSummary, totalEntries: logs.length, generatedAt: now.toISOString() },
          },
        })
        summariesGenerated++

        // Send notification
        const highlights = aiSummary?.highlights || []
        const score = aiSummary?.score || null
        const message = highlights.length > 0
          ? `📊 ${highlights[0]}${score ? ` (Health Score: ${score}/100)` : ''}`
          : `📊 You logged ${logs.length} health entries yesterday. Tap to see your summary.`

        await NotificationBridge.sendNotification({
          userId,
          title: '🏥 Daily Health Summary',
          message,
          type: 'SYSTEM',
          module: 'PHARMACY',
          data: {
            actionType: 'navigate',
            screen: 'HealthRecord',
            params: [],
          },
        })
        notificationsSent++

        // Check for concerns and send alert
        if (aiSummary?.concerns?.length > 0) {
          await NotificationBridge.sendNotification({
            userId,
            title: '⚠️ Health Alert',
            message: `Attention: ${aiSummary.concerns[0]}`,
            type: 'SYSTEM',
            module: 'PHARMACY',
            data: {
              actionType: 'navigate',
              screen: 'HealthRecord',
              params: [],
            },
          })
          notificationsSent++
        }
      } catch (userErr) {
        console.error(`Health summary failed for user ${userId}:`, userErr)
      }
    }

    // Weekly summary – runs on Mondays
    const dayOfWeek = now.getDay() // 0=Sun, 1=Mon
    if (dayOfWeek === 1) {
      const weekStart = new Date(now)
      weekStart.setDate(weekStart.getDate() - 7)
      weekStart.setHours(0, 0, 0, 0)

      const weeklyUsers = await prisma.healthLog.findMany({
        where: { recordedAt: { gte: weekStart, lte: yesterdayEnd } },
        select: { userId: true },
        distinct: ['userId'],
      })

      for (const { userId } of weeklyUsers) {
        try {
          const logs = await prisma.healthLog.findMany({
            where: { userId, recordedAt: { gte: weekStart, lte: yesterdayEnd } },
          })

          await prisma.healthSummary.create({
            data: {
              userId,
              period: 'WEEKLY',
              startDate: weekStart,
              endDate: yesterdayEnd,
              summary: { totalEntries: logs.length, generatedAt: now.toISOString() },
            },
          })

          await NotificationBridge.sendNotification({
            userId,
            title: '📈 Weekly Health Report',
            message: `Your weekly health report is ready! You logged ${logs.length} entries this week.`,
            type: 'SYSTEM',
            module: 'PHARMACY',
            data: {
              actionType: 'navigate',
              screen: 'HealthRecord',
              params: [],
            },
          })
          notificationsSent++
          summariesGenerated++
        } catch {}
      }
    }

    return NextResponse.json({
      success: true,
      stats: { usersProcessed: activeUsers.length, summariesGenerated, notificationsSent },
    })
  } catch (error: any) {
    console.error('Health summary cron error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
