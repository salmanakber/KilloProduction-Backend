import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")
    const search = searchParams.get("search") || ""
    const role = searchParams.get("role") || "ALL"
    const status = searchParams.get("status") || "ALL"

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ]
    }

    if (role !== "ALL") {
      where.role = role
    }

    if (status !== "ALL") {
      if (status === "ACTIVE") {
        where.isActive = true
      } else if (status === "INACTIVE") {
        where.isActive = false
      } else {
        where.status = status
      }
    }

    // Get users with pagination
    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          userProfile: true,
          autoPartsStore: { select: { storeName: true } },
          pharmacy: { select: { pharmacyName: true } },
          restaurant: { select: { name: true } },
          groceryStore: { select: { storeName: true } },
          riderProfile: { select: { vehicleType: true, isOnline: true } },
          _count: {
            select: {
              customerOrders: true,
              vendorOrders: true,
              riderDeliveries: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ])

    // Process users data
    const processedUsers = await Promise.all(
      users.map(async (user) => {
        // Get additional stats for each user
        const [totalSpent, averageRating] = await Promise.all([
          prisma.order.aggregate({
            where: {
              customerId: user.id,
              status: "DELIVERED",
            },
            _sum: { total: true },
          }),
          prisma.review.aggregate({
            where: {
              targetId: user.id,
              targetType: user.role === "VENDOR" ? "VENDOR" : "RIDER",
            },
            _avg: { rating: true },
          }),
        ])

        // Determine module based on user type
        let userModule = undefined
        if (user.autoPartsStore) userModule = "AUTO_PARTS"
        else if (user.pharmacy) userModule = "PHARMACY"
        else if (user.restaurant) userModule = "FOOD"
        else if (user.groceryStore) userModule = "GROCERY"
        else if (user.riderProfile) userModule = "RIDING"

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          module: userModule,
          status: user.isActive ? "ACTIVE" : "INACTIVE",
          isVerified: user.isVerified,
          joinedAt: user.createdAt.toISOString(),
          lastActive: user.userProfile?.lastLoginAt
            ? new Date(user.userProfile.lastLoginAt).toLocaleDateString()
            : "Never",
          location: user.userProfile?.address || "Not provided",
          totalOrders: user._count.customerOrders + user._count.vendorOrders + user._count.riderDeliveries,
          totalSpent: totalSpent._sum.total || 0,
          rating: averageRating._avg.rating || 0,
          avatar: user.avatar,
        }
      }),
    )

    return NextResponse.json({
      users: processedUsers,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}
