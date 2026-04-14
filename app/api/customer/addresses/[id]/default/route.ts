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

    // Check if address belongs to user
    const existingAddress = await prisma.address.findFirst({
      where: { id, userId: session.id },
    })

    if (!existingAddress) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 })
    }

    // Use transaction to update addresses
    await prisma.$transaction(async (tx) => {
      // Unset all other default addresses
      await tx.address.updateMany({
        where: { userId: session.id },
        data: { isDefault: false },
      })

      // Set this address as default
      await tx.address.update({
        where: { id },
        data: { isDefault: true },
      })
    })

    return NextResponse.json({
      success: true,
      message: 'Default address updated successfully',
    })
  } catch (error) {
    console.error('Error setting default address:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
