import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from "@/lib/auth"
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const type = searchParams.get('type') // CREDIT, DEBIT, etc.
    const status = searchParams.get('status') // PENDING, COMPLETED, etc.

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {
      userId: session.id
    }

    if (type) {
      where.type = type
    }

    if (status) {
      where.status = status
    }

    // Get wallet transactions
    const [transactions, totalCount] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        select: {
          id: true,
          type: true,
          amount: true,
          balance: true,
          description: true,
          reference: true,
          status: true,
          orderId: true,
          metadata: true,
          clearsAt: true,
          createdAt: true
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limit
      }),
      prisma.walletTransaction.count({ where })
    ])

    // Get current wallet balance
    const wallet = await prisma.wallet.findUnique({
      where: {
        userId: session.id,
        isActive: true
      },
      select: {
        balance: true,
        currency: true
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNextPage: page * limit < totalCount,
          hasPrevPage: page > 1
        },
        wallet: wallet || { balance: 0, currency: 'NGN' }
      }
    })

  } catch (error: any) {
    console.error('Error fetching wallet transactions:', error)
    return NextResponse.json({
      error: error.message || 'Failed to fetch wallet transactions'
    }, { status: 500 })
  }
}