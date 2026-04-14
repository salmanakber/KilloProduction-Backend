import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest()
    if (!session || session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const replies = await prisma.SupportTicketReply.findMany({
      where: { ticketId: params.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatar: true,
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    })

    return NextResponse.json({ replies })
  } catch (error) {
    console.error('Error fetching ticket replies:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest()
    if (!session || session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { message, isAdmin, attachments } = body

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Verify ticket exists
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id }
    })

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Create reply
    const reply = await prisma.SupportTicketReply.create({
      data: {
        ticketId: params.id,
        userId: session.id,
        message: message.trim(),
        isAdmin: isAdmin ?? true, // Default to true for admin
        attachments: attachments ? JSON.stringify(attachments) : null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatar: true,
          }
        }
      }
    })

    // Update ticket status to IN_PROGRESS if it was OPEN
    if (ticket.status === 'OPEN') {
      await prisma.supportTicket.update({
        where: { id: params.id },
        data: { status: 'IN_PROGRESS' }
      })
    }

    return NextResponse.json({ success: true, reply })
  } catch (error) {
    console.error('Error creating ticket reply:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

