import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

// GET /api/health/doctor-visits?limit=20
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const visits = await prisma.doctorVisit.findMany({
      where: { userId: user.id },
      orderBy: { visitedAt: 'desc' },
      take: Math.min(limit, 100),
    })

    return NextResponse.json({ visits })
  } catch (error) {
    console.error('Error fetching doctor visits:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/health/doctor-visits
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { doctorName, reason, diagnosis, notes, visitedAt } = body

    if (!reason) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }

    const visit = await prisma.doctorVisit.create({
      data: {
        userId: user.id,
        doctorName: doctorName || null,
        reason,
        diagnosis: diagnosis || null,
        notes: notes || null,
        visitedAt: visitedAt ? new Date(visitedAt) : new Date(),
      },
    })

    return NextResponse.json({ visit })
  } catch (error) {
    console.error('Error creating doctor visit:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/health/doctor-visits?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const existing = await prisma.doctorVisit.findFirst({ where: { id, userId: user.id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.doctorVisit.delete({ where: { id } })
    return NextResponse.json({ message: 'Deleted' })
  } catch (error) {
    console.error('Error deleting doctor visit:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
