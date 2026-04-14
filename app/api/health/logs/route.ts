import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

// GET /api/health/logs?type=BLOOD_PRESSURE&from=...&to=...&limit=50
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const logType = searchParams.get('type') || undefined
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const where: any = { userId: user.id }
    if (logType) where.logType = logType
    if (from || to) {
      where.recordedAt = {}
      if (from) where.recordedAt.gte = new Date(from)
      if (to) where.recordedAt.lte = new Date(to)
    }

    const logs = await prisma.healthLog.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      take: Math.min(limit, 200),
    })

    return NextResponse.json({ logs })
  } catch (error) {
    console.error('Error fetching health logs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/health/logs – create a health log entry
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { logType, value, notes, recordedAt } = body

    if (!logType || !value) {
      return NextResponse.json({ error: 'logType and value are required' }, { status: 400 })
    }

    const validTypes = [
      'BLOOD_PRESSURE', 'BLOOD_SUGAR', 'BODY_TEMPERATURE', 'WEIGHT',
      'STEPS', 'SYMPTOMS', 'MOOD', 'SLEEP', 'WATER_INTAKE', 'CUSTOM',
    ]
    if (!validTypes.includes(logType)) {
      return NextResponse.json({ error: `Invalid logType. Must be one of: ${validTypes.join(', ')}` }, { status: 400 })
    }

    const log = await prisma.healthLog.create({
      data: {
        userId: user.id,
        logType,
        value,
        notes: notes || null,
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
      },
    })

    return NextResponse.json({ log })
  } catch (error) {
    console.error('Error creating health log:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/health/logs?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const logId = searchParams.get('id')
    if (!logId) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const existing = await prisma.healthLog.findFirst({ where: { id: logId, userId: user.id } })
    if (!existing) return NextResponse.json({ error: 'Log not found' }, { status: 404 })

    await prisma.healthLog.delete({ where: { id: logId } })
    return NextResponse.json({ message: 'Log deleted' })
  } catch (error) {
    console.error('Error deleting health log:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
