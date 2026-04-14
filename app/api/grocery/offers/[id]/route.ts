import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    const offer = await prisma.groceryOffer.findUnique({
      where: { id },
      include: {
        store: {
          select: {
            id: true,
            storeName: true,
            logo: true,
            coverImage: true,
            address: true,
            rating: true,
            totalReviews: true,
            isOpen: true,
            isVerified: true,
          },
        },
      },
    })

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    return NextResponse.json({ offer })
  } catch (error) {
    console.error('Error fetching grocery offer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
