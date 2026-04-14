import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest()
    
    if (!session || session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const category = searchParams.get('category')
    const range = searchParams.get('range') || '30d'

    // Build where clause
    const where: any = {}
    
    if (status && status !== 'ALL') {
      where.status = status
    }
    
    if (priority && priority !== 'ALL') {
      where.priority = priority
    }
    
    if (category && category !== 'ALL') {
      where.category = category
    }

    // Date range filter
    const dateFilter = getDateFilter(range)
    if (dateFilter) {
      where.createdAt = { gte: dateFilter }
    }

    const tickets = await prisma.supportTicket.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          }
        },
        replies: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ tickets })
  } catch (error) {
    console.error('Error fetching support tickets:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest()
    
    if (!session || session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { userId, subject, description, category, priority } = body

    // Generate ticket number
    const ticketCount = await prisma.supportTicket.count()
    const ticketNumber = `TKT-${String(ticketCount + 1).padStart(6, '0')}`

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        userId,
        subject,
        description,
        category,
        priority: priority || 'MEDIUM',
        status: 'OPEN',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          }
        }
      }
    })

    return NextResponse.json({ success: true, ticket })
  } catch (error) {
    console.error('Error creating support ticket:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function getDateFilter(range: string): Date | null {
  const now = new Date()
  switch (range) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000)
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    default:
      return null
  }
}

