import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { ticketId: string } }
) {
  try {
    const session = await authenticateRequest()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { ticketId } = params

    // Verify ticket belongs to user
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id: ticketId,
        userId: session.id,
      },
    })

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Get all replies for this ticket
    const replies = await prisma.SupportTicketReply.findMany({
      where: { ticketId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    })

    return NextResponse.json(replies)
  } catch (error) {
    console.error('Error fetching ticket replies:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { ticketId: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { ticketId } = params
    const body = await request.json()
    const { message, attachments } = body

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Verify ticket belongs to user
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id: ticketId,
        userId: session.id,
      },
    })

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Create the reply
    const reply = await prisma.supportTicketReply.create({
      data: {
        ticketId,
        userId: session.id,
        message: message.trim(),
        attachments: attachments || null,
        isAdmin: session.role === 'ADMIN' || session.role === 'SUPER_ADMIN'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          }
        }
      }
    })

    // Update ticket status to IN_PROGRESS if it was OPEN
    if (ticket.status === 'OPEN') {
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'IN_PROGRESS' }
      })
    }

    return NextResponse.json(reply, { status: 201 })
  } catch (error) {
    console.error('Error creating ticket reply:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
