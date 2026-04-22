import { NextRequest, NextResponse } from 'next/server'
import { runPillRemindersJob } from '@/lib/pill-reminders-runner'

/**
 * CRON: Pill Reminders
 * Runs every hour (or more frequently) to check and send pill reminders.
 * Checks active reminders and sends notifications based on their scheduled times.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stats = await runPillRemindersJob()

    return NextResponse.json({
      success: true,
      stats: {
        remindersChecked: stats.remindersChecked,
        notificationsSent: stats.notificationsSent,
        expiredDeactivated: stats.expiredDeactivated,
      },
    })
  } catch (error: any) {
    console.error('Pill reminders cron error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
