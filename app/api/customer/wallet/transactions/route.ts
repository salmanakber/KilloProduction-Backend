import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const filter = searchParams.get('filter') || 'all' // all, week, month, year
    const skip = (page - 1) * limit

    // Calculate date range based on filter
    let dateFilter: any = {}
    const now = new Date()
    
    switch (filter) {
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        dateFilter = { gte: weekAgo }
        break
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        dateFilter = { gte: monthAgo }
        break
      case 'year':
        const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        dateFilter = { gte: yearAgo }
        break
      default:
        dateFilter = {}
    }

    // Build where clause
    const whereClause: any = { userId: session.id }
    if (Object.keys(dateFilter).length > 0) {
      whereClause.createdAt = dateFilter
    }

    // Get user's wallet transactions
    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true
          }
        }
      }
    })

    // Get total count for pagination
    const totalCount = await prisma.transaction.count({
      where: whereClause
    })

    return NextResponse.json({
      transactions,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        filter
      }
    })
  } catch (error) {
    console.error('Error fetching wallet transactions:', error)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}