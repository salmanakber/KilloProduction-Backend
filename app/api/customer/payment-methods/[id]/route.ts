import { authenticateRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
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

    // Soft delete by setting isActive to false
    await prisma.paymentMethod.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({
      success: true,
      message: 'Payment method deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting payment method:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
