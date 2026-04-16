import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const product = await prisma.groceryProduct.findUnique({
      where: { id },
      include: {
        store: {
          select: {
            id: true,
            storeName: true,
            logo: true,
            coverImage: true,
            rating: true,
            totalReviews: true,
            isOpen: true,
            isVerified: true,
            deliveryFee: true,
            minOrderAmount: true,
            address: true,
          },
        },
      },
    })

    if (!product || product.isActive === false || (product.stock ?? 0) <= 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({ product })
  } catch (error) {
    console.error('Error fetching grocery product:', error)
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}
