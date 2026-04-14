import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId: session.id },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    })

    // Get loyalty points
    const loyaltyPoints = await prisma.loyaltyPoint.aggregate({
      where: {
        userId: session.id,
        isRedeemed: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      _sum: { points: true }
    })

    // Get total spent from payments (excluding wallet top-ups)
    const totalSpent = await prisma.payment.aggregate({
      where: {
        userId: session.id,
        status: 'PAID',
        metadata: {
          path: ['type'],
          not: 'WALLET_TOPUP'
        }
      },
      _sum: { amount: true }
    })

    // Get total earned from transactions
    const totalEarned = await prisma.transaction.aggregate({
      where: {
        userId: session.id,
        type: { in: ['EARNING', 'WALLET_TOPUP', 'REFUND', 'COMMISSION'] },
        status: 'COMPLETED'
      },
      _sum: { amount: true }
    })

    const walletData = {
      balance: wallet?.balance || 0,
      currency: wallet?.currency || 'USD',
      totalEarned: totalEarned._sum.amount || 0,
      totalSpent: totalSpent._sum.amount || 0,
      transactions: wallet?.transactions || [],
      loyaltyPoints: loyaltyPoints._sum.points || 0
    }

    return NextResponse.json(walletData)
  } catch (error) {
    console.error('Error fetching wallet data:', error)
    return NextResponse.json({ error: 'Failed to fetch wallet data' }, { status: 500 })
  }
}