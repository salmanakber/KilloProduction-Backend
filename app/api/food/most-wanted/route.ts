import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "10")
    const userLat = searchParams.get('latitude') ? parseFloat(searchParams.get('latitude')!) : null
    const userLon = searchParams.get('longitude') ? parseFloat(searchParams.get('longitude')!) : null
    const maxDistance = searchParams.get('maxDistance') ? parseFloat(searchParams.get('maxDistance')!) : null

    // Haversine formula to calculate distance
    function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const R = 6371
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLon = (lon2 - lon1) * Math.PI / 180
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      return R * c
    }

    // Get most purchased menu items from OrderItem
    const mostPurchasedItems = await prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        productType: "MENU_ITEM",
        order: {
          module: "FOOD",
          status: { in: ["DELIVERED", "CONFIRMED"] },
        },
      },
      _sum: {
        quantity: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
      take: limit * 2, // Get more to filter by location
    })

    const productIds = mostPurchasedItems.map((item) => item.productId)

    // Fetch menu items with restaurant details including location
    const menuItems = await prisma.menuItem.findMany({
      where: {
        id: { in: productIds },
        isAvailable: true,
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            logo: true,
            rating: true,
            totalReviews: true,
            isOpen: true,
            latitude: true,
            longitude: true,
            user: {
              include: {
                vendorProfile: {
                  select: {
                    latitude: true,
                    longitude: true,
                  }
                }
              }
            }
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Sort by purchase count (matching the order from mostPurchasedItems)
    const itemsWithStats = menuItems
      .map((item) => {
        const stats = mostPurchasedItems.find((stat) => stat.productId === item.id)
        return {
          ...item,
          purchaseCount: stats?._count.id || 0,
          totalQuantitySold: stats?._sum.quantity || 0,
        }
      })
      .sort((a, b) => b.purchaseCount - a.purchaseCount)

    // Also check user's order history for personalized recommendations
    const userOrders = await prisma.order.findMany({
      where: {
        customerId: user.id,
        module: "FOOD",
        status: { in: ["DELIVERED", "CONFIRMED"] },
      },
      include: {
        orderItems: {
          where: {
            productType: "MENU_ITEM",
          },
          select: {
            productId: true,
            quantity: true,
          },
        },
      },
      take: 50,
    })

    // Get user's most ordered items
    const userOrderedItemIds = new Map<string, number>()
    userOrders.forEach((order) => {
      order.orderItems.forEach((item) => {
        const count = userOrderedItemIds.get(item.productId) || 0
        userOrderedItemIds.set(item.productId, count + item.quantity)
      })
    })

    // Filter by location if provided
    let filteredItems = itemsWithStats
    if (userLat !== null && userLon !== null && maxDistance !== null) {
      filteredItems = itemsWithStats
        .map((item) => {
          const restaurant = item.restaurant as any
          const lat = restaurant.latitude || restaurant.user?.vendorProfile?.latitude
          const lon = restaurant.longitude || restaurant.user?.vendorProfile?.longitude
          
          if (!lat || !lon) return null

          const distance = calculateDistance(userLat, userLon, Number(lat), Number(lon))
          if (distance > maxDistance) return null

          return {
            ...item,
            restaurant: {
              ...restaurant,
              distance: parseFloat(distance.toFixed(2)),
            },
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    }

    // Boost items that user has ordered before
    const personalizedItems = filteredItems.map((item) => ({
      ...item,
      userOrderCount: userOrderedItemIds.get(item.id) || 0,
      score: item.purchaseCount + (userOrderedItemIds.get(item.id) || 0) * 2, // Boost user items by 2x
    }))

    // Sort by score (purchase count + user preference boost)
    personalizedItems.sort((a, b) => b.score - a.score)

    // Get search history if available (from user activity or separate search log)
    // For now, we'll use order history as the primary signal

    return NextResponse.json({
      items: personalizedItems.slice(0, limit).map((item) => ({
        id: item.id,
        restaurantId: item.restaurantId,
        name: item.name,
        description: item.description,
        price: item.price,
        compareAtPrice: item.compareAtPrice,
        preparationTime: item.preparationTime,
        calories: item.calories,
        images: item.images,
        isVegetarian: item.isVegetarian,
        isVegan: item.isVegan,
        isGlutenFree: item.isGlutenFree,
        isAvailable: item.isAvailable,
        isFeatured: item.isFeatured,
        isPopular: item.isPopular,
        tags: item.tags,
        restaurant: item.restaurant,
        category: item.category,
        purchaseCount: item.purchaseCount,
        totalQuantitySold: item.totalQuantitySold,
        userOrderCount: item.userOrderCount,
      })),
      total: personalizedItems.length,
    })
  } catch (error) {
    console.error("Error fetching most wanted items:", error)
    return NextResponse.json({ error: "Failed to fetch most wanted items" }, { status: 500 })
  }
}
