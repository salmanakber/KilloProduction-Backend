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
    const { subject, description, category, priority, transactionReference, transferReference, module } = body

    // Validate required fields
    if (!subject || !description || !category) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const txRef = String(transactionReference || transferReference || '').trim()
    const isMoney = category === 'money_transfer' || module === 'MONEY_TRANSFER'
    if (isMoney && !txRef) {
      return NextResponse.json(
        { error: 'Transaction reference or payment ID is required for money transfer disputes' },
        { status: 400 },
      )
    }

    let fullDescription = String(description).trim()
    if (txRef) {
      fullDescription = `[Transaction ref: ${txRef}]\n\n${fullDescription}`
    }

    // Generate ticket number
    const ticketNumber = `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: session.id,
        ticketNumber,
        subject,
        description: fullDescription,
        category: isMoney ? 'money_transfer' : category,
        priority: priority || 'MEDIUM',
        status: 'OPEN',
        attachments: txRef
          ? ({ transactionReference: txRef, module: module || 'MONEY_TRANSFER' } as object)
          : undefined,
      }
    })

    return NextResponse.json(ticket, { status: 201 })
  } catch (error) {
    console.error('Error creating support ticket:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
