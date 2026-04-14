import { authenticateRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const paymentMethods = await prisma.paymentMethod.findMany({
      where: { 
        userId: session.id,
        isActive: true 
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ],
    })

    return NextResponse.json({
      success: true,
      data: paymentMethods,
    })
  } catch (error) {
    console.error('Error fetching payment methods:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
