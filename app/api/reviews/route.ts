import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

/**
 * GET /api/reviews?targetId=xxx&targetType=MECHANIC|VENDOR|RIDER|PRODUCT|SERVICE
 * 
 * Fetches reviews for a specific target (user, product, service, etc.)
 * Supports different target types: VENDOR, RIDER, MECHANIC, PRODUCT, SERVICE
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const targetId = searchParams.get("targetId")
    const targetType = searchParams.get("targetType") as "VENDOR" | "RIDER" | "MECHANIC" | "PRODUCT" | "SERVICE" | "CUSTOMER" | null

    if (!targetId || !targetType) {
      return NextResponse.json(
        { error: "targetId and targetType are required" },
        { status: 400 }
      )
    }

    // Validate targetType
    const validTargetTypes = ["VENDOR", "RIDER", "MECHANIC", "PRODUCT", "SERVICE", "CUSTOMER"]
    if (!validTargetTypes.includes(targetType)) {
      return NextResponse.json(
        { error: "Invalid targetType. Must be one of: VENDOR, RIDER, MECHANIC, PRODUCT, SERVICE, CUSTOMER" },
        { status: 400 }
      )
    }

    // Build where clause based on targetType
    // Note: For RIDER, we use riderId (RiderProfile.id), but for MECHANIC and VENDOR we use targetId (User.id)
    const where: any = {
      targetType,
    }

    if (targetType === "RIDER") {
      // For RIDER, find the RiderProfile by userId, then use riderId (RiderProfile.id)
      const riderProfile = await prisma.riderProfile.findUnique({
        where: { userId: targetId },
        select: { id: true },
      })
      if (riderProfile) {
        where.riderId = riderProfile.id
      } else {
        return NextResponse.json({ reviews: [], averageRating: 0, totalReviews: 0 })
      }
    } else {
      // For MECHANIC, VENDOR, PRODUCT, SERVICE - use targetId directly (User.id)
      where.targetId = targetId
    }

    // Fetch reviews with user information
    const [reviews, stats] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.review.aggregate({
        where,
        _avg: { rating: true },
        _count: { id: true },
      }),
    ])

    // Transform reviews to include reviewer info
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
    console.error("Error fetching reviews:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch reviews" },
      { status: 500 }
    )
  }
}