import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    console.log('user', user)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tickets = await prisma.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(tickets)
  } catch (error) {
    console.error('Error fetching support tickets:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { subject, description, category, priority } = body

    // Validate required fields
    if (!subject || !description || !category) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Generate ticket number
    const ticketNumber = `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: session.id,
        ticketNumber,
        subject,
        description,
        category,
        priority: priority || 'MEDIUM',
        status: 'OPEN'
      }
    })

    return NextResponse.json(ticket, { status: 201 })
  } catch (error) {
    console.error('Error creating support ticket:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
