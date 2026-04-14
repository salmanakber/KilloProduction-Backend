import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vendor's restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: session.id },
      select: { id: true }
    })

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    // Fetch reviews for this restaurant
    const [reviews, stats] = await Promise.all([
      prisma.review.findMany({
        where: {
          foodId: restaurant.id
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.review.aggregate({
        where: {
          foodId: restaurant.id
        },
        _avg: { rating: true },
        _count: { id: true },
      }),
    ])

    // Transform reviews
    const formattedReviews = reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      images: review.images,
      isVerified: review.isVerified,
      isHelpful: review.isHelpful,
      response: review.response,
      respondedAt: review.respondedAt,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
      reviewer: {
        id: review.user.id,
        name: review.user.name,
        avatar: review.user.avatar,
      },
    }))

    return NextResponse.json({
      reviews: formattedReviews,
      averageRating: stats._avg.rating || 0,
      totalReviews: stats._count.id || 0,
    })
  } catch (error: any) {
    console.error('Error fetching restaurant reviews:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}
