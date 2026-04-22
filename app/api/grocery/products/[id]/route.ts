import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateRating } from '@/lib/calculateRating'

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

    const storeId = product.store.id
    const reviewRows = await prisma.review.findMany({
      where: {
        OR: [
          { groceryId: storeId },
          {
            order: {
              module: 'GROCERY',
              groceryId: storeId,
            },
          },
        ],
      },
      select: { rating: true },
    })
    const stats = calculateRating(reviewRows.map((r) => r.rating))
    const storeWithReviews = {
      ...product.store,
      rating: stats.totalReviews > 0 ? stats.roundedRating : product.store.rating ?? 0,
      totalReviews: stats.totalReviews > 0 ? stats.totalReviews : product.store.totalReviews ?? 0,
    }

    return NextResponse.json({ product: { ...product, store: storeWithReviews } })
  } catch (error) {
    console.error('Error fetching grocery product:', error)
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}
