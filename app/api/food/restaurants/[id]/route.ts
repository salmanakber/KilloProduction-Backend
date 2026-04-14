import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: params.id },
      include: {
        user: {
          select: {
            name: true,
            phone: true,
          },
        },
        menuCategories: {
          where: { isActive: true },
          include: {
            menuItems: {
              where: { isAvailable: true },
              orderBy: [{ isPopular: 'desc' }, { isFeatured: 'desc' }, { name: 'asc' }],
            },
          },
        },
        restaurantOffers: {
          where: {
            isActive: true,
            startsAt: { lte: new Date() },
            expiresAt: { gte: new Date() },
          },
          orderBy: { discountValue: 'desc' },
        },
        reviews: {
          where: {
            foodId: params.id,
            targetType: 'VENDOR',
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
          take: 5, // Get recent 5 reviews
        },
        _count: {
          select: {
            menuItems: {
              where: { isAvailable: true },
            },
            reviews: {
              where: {
                foodId: params.id,
                targetType: 'VENDOR',
              },
            },
          },
        },
      },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    // Calculate sales for each category and sort by most selling
    const categoriesWithSales = await Promise.all(
      restaurant.menuCategories.map(async (category) => {
        const menuItemIds = category.menuItems.map(item => item.id)
        
        let totalSales = 0
        if (menuItemIds.length > 0) {
          const salesData = await prisma.orderItem.aggregate({
            where: {
              productId: { in: menuItemIds },
              productType: 'MENU_ITEM',
              order: {
                module: 'FOOD',
                status: { in: ['DELIVERED', 'CONFIRMED'] }
              }
            },
            _sum: { quantity: true }
          })
          totalSales = salesData._sum.quantity || 0
        }

        return {
          ...category,
          totalSales,
        }
      })
    )

    // Sort categories by sales (most selling first), then by sortOrder
    categoriesWithSales.sort((a, b) => {
      if (b.totalSales !== a.totalSales) {
        return b.totalSales - a.totalSales
      }
      return (a.sortOrder || 0) - (b.sortOrder || 0)
    })

    // Format reviews
    const formattedReviews = restaurant.reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      images: review.images,
      createdAt: review.createdAt.toISOString(),
      reviewer: {
        id: review.user.id,
        name: review.user.name,
        avatar: review.user.avatar,
      },
    }))

    // Calculate average rating from all reviews (not just the 5 recent ones)
    const allReviewsStats = await prisma.review.aggregate({
      where: {
        foodId: params.id,
        targetType: 'VENDOR',
      },
      _avg: { rating: true },
      _count: { id: true },
    })

    const restaurantWithSortedCategories = {
      ...restaurant,
      menuCategories: categoriesWithSales,
      reviews: formattedReviews,
      averageRating: allReviewsStats._avg.rating || 0,
      totalReviews: allReviewsStats._count.id || 0,
    }

    return NextResponse.json({ restaurant: restaurantWithSortedCategories })
  } catch (error) {
    console.error("Restaurant fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch restaurant" }, { status: 500 })
  }
}
