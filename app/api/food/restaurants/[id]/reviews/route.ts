import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "50")

    // Fetch reviews for this restaurant
    const [reviews, stats] = await Promise.all([
      prisma.review.findMany({
        where: {
          foodId: params.id,
          targetType: 'FOOD',
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
        take: limit,
      }),
      prisma.review.aggregate({
        where: {
          foodId: params.id,
          targetType: 'FOOD',
        },
        _avg: { rating: true },
        _count: { id: true },
      }),
    ])

    // Format reviews
    const formattedReviews = reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      images: review.images,
      isVerified: review.isVerified,
      createdAt: review.createdAt.toISOString(),
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
  } catch (error) {
    console.error("Error fetching restaurant reviews:", error)
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 })
  }
}
