import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    // Increment the view count for the FAQ
    const updatedFAQ = await prisma.fAQ.update({
      where: { id },
      data: {
        views: {
          increment: 1
        }
      }
    })

    return NextResponse.json({ success: true, views: updatedFAQ.views })
  } catch (error) {
    console.error('Error incrementing FAQ views:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
