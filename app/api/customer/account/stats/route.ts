import { authenticateRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's wallet balance
    const wallet = await prisma.wallet.findUnique({
      where: { userId: session.id },
    })

    // Get total orders count
    const totalOrders = await prisma.order.count({
      where: { customerId: session.id },
    })

    // Get total spent (excluding wallet top-ups)
    const totalSpentResult = await prisma.payment.aggregate({
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

    // Get loyalty points
    const loyaltyPointsResult = await prisma.loyaltyPoint.aggregate({
      where: { userId: session.id },
      _sum: { points: true }
    })

    console.log('totalSpentResult', totalSpentResult)
    console.log('loyaltyPointsResult', loyaltyPointsResult)
    console.log('wallet', wallet)
    console.log('totalOrders', totalOrders)
    console.log('session', session)
    console.log('session.id', session.id)
    console.log('session.email', session.email)
    console.log('session.name', session.name)
    console.log('session.role', session.role)   
    return NextResponse.json({
      success: true,
      data: {
        totalOrders,
        totalSpent: totalSpentResult._sum.amount || 0,
        loyaltyPoints: loyaltyPointsResult._sum.points || 0,
        walletBalance: wallet?.balance || 0,
      },
    })
  } catch (error) {
    console.error('Error fetching account stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
