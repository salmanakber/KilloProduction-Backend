import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '30d'

    const dateFilter = getDateFilter(range)
    const where = dateFilter ? { createdAt: { gte: dateFilter } } : {}

    const [
      totalTickets,
      openTickets,
      inProgressTickets,
      resolvedTickets,
      closedTickets,
      urgentTickets,
      avgResponseTime,
      ticketsByCategory,
    ] = await Promise.all([
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.count({ where: { ...where, status: 'OPEN' } }),
      prisma.supportTicket.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      prisma.supportTicket.count({ where: { ...where, status: 'RESOLVED' } }),
      prisma.supportTicket.count({ where: { ...where, status: 'CLOSED' } }),
      prisma.supportTicket.count({ where: { ...where, priority: 'URGENT' } }),
      calculateAvgResponseTime(where),
      getTicketsByCategory(where),
    ])

    const stats = {
      totalTickets,
      openTickets,
      inProgressTickets,
      resolvedTickets,
      closedTickets,
      urgentTickets,
      avgResponseTime,
      ticketsByCategory,
      resolutionRate: totalTickets > 0 ? ((resolvedTickets + closedTickets) / totalTickets * 100).toFixed(1) : 0,
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error fetching ticket stats:', error)
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

async function calculateAvgResponseTime(where: any): Promise<string> {
  const tickets = await prisma.supportTicket.findMany({
    where: {
      ...where,
      replies: {
        some: {
          isAdmin: true
        }
      }
    },
    include: {
      replies: {
        where: { isAdmin: true },
        orderBy: { createdAt: 'asc' },
        take: 1
      }
    }
  })

  if (tickets.length === 0) return '0h'

  let totalMinutes = 0
  for (const ticket of tickets) {
    if (ticket.replies[0]) {
      const diff = ticket.replies[0].createdAt.getTime() - ticket.createdAt.getTime()
      totalMinutes += diff / (1000 * 60)
    }
  }

  const avgMinutes = totalMinutes / tickets.length
  const hours = Math.floor(avgMinutes / 60)
  return `${hours}h`
}

async function getTicketsByCategory(where: any) {
  const categories = await prisma.supportTicket.groupBy({
    by: ['category'],
    where,
    _count: true,
  })

  return categories.map(cat => ({
    category: cat.category,
    count: cat._count
  }))
}

