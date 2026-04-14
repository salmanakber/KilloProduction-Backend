import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

// GET /api/health/lab-results?limit=20
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const results = await prisma.healthLabResult.findMany({
      where: { userId: user.id },
      orderBy: { testedAt: 'desc' },
      take: Math.min(limit, 100),
    })

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Error fetching lab results:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/health/lab-results
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { testName, value, unit, normalRange, notes, testedAt } = body

    if (!testName || !value) {
      return NextResponse.json({ error: 'testName and value are required' }, { status: 400 })
    }

    const result = await prisma.healthLabResult.create({
      data: {
        userId: user.id,
        testName,
        value: String(value),
        unit: unit || null,
        normalRange: normalRange || null,
        notes: notes || null,
        testedAt: testedAt ? new Date(testedAt) : new Date(),
      },
    })

    return NextResponse.json({ result })
  } catch (error) {
    console.error('Error creating lab result:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/health/lab-results?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const existing = await prisma.healthLabResult.findFirst({ where: { id, userId: user.id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.healthLabResult.delete({ where: { id } })
    return NextResponse.json({ message: 'Deleted' })
  } catch (error) {
    console.error('Error deleting lab result:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
