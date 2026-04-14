import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { isHelpful } = body

    if (typeof isHelpful !== 'boolean') {
      return NextResponse.json({ error: 'isHelpful must be a boolean' }, { status: 400 })
    }

    // Update the feedback count for the FAQ
    const updateData = isHelpful 
      ? { helpful: { increment: 1 } }
      : { notHelpful: { increment: 1 } }

    const updatedFAQ = await prisma.fAQ.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json({ 
      success: true, 
      helpful: updatedFAQ.helpful,
      notHelpful: updatedFAQ.notHelpful
    })
  } catch (error) {
    console.error('Error updating FAQ feedback:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
