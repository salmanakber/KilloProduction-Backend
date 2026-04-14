import { authenticateRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    // Check if payment method belongs to user
    const existingPaymentMethod = await prisma.paymentMethod.findFirst({
      where: { id, userId: session.id },
    })

    if (!existingPaymentMethod) {
      return NextResponse.json({ error: 'Payment method not found' }, { status: 404 })
    }

    // Use transaction to update payment methods
    await prisma.$transaction(async (tx) => {
      // Unset all other default payment methods
      await tx.paymentMethod.updateMany({
        where: { userId: session.id },
        data: { isDefault: false },
      })

      // Set this payment method as default
      await tx.paymentMethod.update({
        where: { id },
        data: { isDefault: true },
      })
    })

    return NextResponse.json({
      success: true,
      message: 'Default payment method updated successfully',
    })
  } catch (error) {
    console.error('Error setting default payment method:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
