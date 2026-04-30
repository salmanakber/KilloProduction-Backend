import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"


export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")
    const status = searchParams.get("status")
    const search = searchParams.get("search")

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {
      role: "VENDOR",
      restaurant: {
        isNot: null,
      },
    }

    if (status && status !== "ALL") {
      if (status === "PENDING") {
        where.restaurant = {
          is: {
            isVerified: false,
          },
        }
      } else if (status === "APPROVED") {
        where.restaurant = {
          is: {
            isVerified: true,
          },
        }
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { restaurant: { name: { contains: search, mode: "insensitive" } } },
      ]
    }

    const [restaurants, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          restaurant: {
            include: {
              _count: {
                select: {
                  menuItems: true,
                },
              },
            },
          },
          vendorOrders: {
            where: {
              module: "FOOD",
            },
            select: {
              id: true,
              total: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ])

    // Fetch all KycRejections for the fetched restaurants
    const restaurantIds = restaurants.map(r => r.restaurant?.id).filter(Boolean) as string[]
    const kycRejections = restaurantIds.length > 0 ? await prisma.kycRejection.findMany({
      where: {
        entityType: "FOOD",
        entityId: { in: restaurantIds },
      },
      include: {
        rejectedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { rejectedAt: "desc" },
    }) : []
    
    // Create a map of entityId to rejections
    const rejectionMap = new Map<string, typeof kycRejections>()
    kycRejections.forEach(rejection => {
      if (!rejectionMap.has(rejection.entityId)) {
        rejectionMap.set(rejection.entityId, [])
      }
      rejectionMap.get(rejection.entityId)!.push(rejection)
    })

    const formattedRestaurants = restaurants.map((restaurant) => {
      const deliveredOrders = (restaurant.vendorOrders || []).filter((order) => order.status === "DELIVERED")
      const totalRevenue = deliveredOrders.reduce((sum, order) => sum + order.total, 0)
      const totalOrders = deliveredOrders.length
      const restaurantId = restaurant.restaurant?.id || restaurant.id
      const rejections = rejectionMap.get(restaurantId) || []

      return {
        id: restaurantId,
        userId: restaurant.id,
        name: restaurant.restaurant?.name || restaurant.name || "Unknown",
        email: restaurant.email || "",
        phone: restaurant.phone || "",
        address: restaurant.restaurant?.address || "",
        cuisine: (restaurant.restaurant?.cuisine as string[]) || [],
        status: restaurant.restaurant?.isVerified ? "APPROVED" : "PENDING",
        isVerified: restaurant.restaurant?.isVerified || false,
        isOpen: restaurant.restaurant?.isOpen || false,
        rating: restaurant.restaurant?.rating || 0,
        totalOrders,
        revenue: totalRevenue,
        createdAt: restaurant.createdAt.toISOString(),
        joinedAt: restaurant.createdAt.toISOString(),
        logo: restaurant.restaurant?.logo,
        coverImage: restaurant.restaurant?.coverImage,
        deliveryTime: restaurant.restaurant?.deliveryTime || "30-45 mins",
        deliveryFee: restaurant.restaurant?.deliveryFee || 0,
        minOrderAmount: restaurant.restaurant?.minOrderAmount || 0,
        documents: {
          businessLicense: restaurant.restaurant?.businessLicense || null,
          foodLicense: restaurant.restaurant?.foodLicense || null,
          restaurantFront: restaurant.restaurant?.restaurantFront || null,
          kitchenPhoto: restaurant.restaurant?.kitchenPhoto || null,
          menuSample: restaurant.restaurant?.menuSample || null,
        },
        rejectionHistory: rejections.map(r => ({
          id: r.id,
          rejectionReason: r.rejectionReason,
          rejectedFields: r.rejectedFields,
          rejectedBy: r.rejectedByUser?.name || "Unknown Admin",
          rejectedAt: r.rejectedAt.toISOString(),
          isResolved: r.isResolved,
        })),
      }
    })

    return NextResponse.json({
      restaurants: formattedRestaurants,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching restaurants:", error)
    return NextResponse.json({ error: "Failed to fetch restaurants" }, { status: 500 })
  }
}
