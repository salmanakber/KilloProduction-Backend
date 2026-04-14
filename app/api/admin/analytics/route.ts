import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const range = searchParams.get("range") || "30d"
    const module = searchParams.get("module") || "ALL"

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()

    switch (range) {
      case "7d":
        startDate.setDate(startDate.getDate() - 7)
        break
      case "30d":
        startDate.setDate(startDate.getDate() - 30)
        break
      case "90d":
        startDate.setDate(startDate.getDate() - 90)
        break
      case "1y":
        startDate.setFullYear(startDate.getFullYear() - 1)
        break
      default:
        startDate.setDate(startDate.getDate() - 30)
    }

    const moduleWhere = module !== "ALL" ? { module } : {}

    // Get comprehensive analytics
    const [overviewStats, moduleBreakdown, timeSeriesData, topVendors, topProducts, userGrowth, revenueGrowth] =
      await Promise.all([
        // Overview statistics
        Promise.all([
          prisma.order.aggregate({
            where: {
              ...moduleWhere,
              status: "DELIVERED",
              createdAt: { gte: startDate, lte: endDate },
            },
            _sum: { total: true },
          }),
          prisma.user.count({
            where: {
              createdAt: { gte: startDate, lte: endDate },
            },
          }),
          prisma.order.count({
            where: {
              ...moduleWhere,
              createdAt: { gte: startDate, lte: endDate },
            },
          }),
          prisma.order.aggregate({
            where: {
              ...moduleWhere,
              status: "DELIVERED",
              createdAt: { gte: startDate, lte: endDate },
            },
            _avg: { total: true },
          }),
        ]),

        // Module breakdown
        prisma.order.groupBy({
          by: ["module"],
          where: {
            status: "DELIVERED",
            createdAt: { gte: startDate, lte: endDate },
          },
          _sum: { total: true },
          _count: true,
        }),

        // Time series data for charts
        prisma.$queryRaw`
        SELECT 
          DATE(createdAt) as date,
          SUM(total) as revenue,
          COUNT(*) as orders,
          COUNT(DISTINCT customerId) as users
        FROM orders 
        WHERE status = 'DELIVERED'
          AND createdAt >= ${startDate}
          AND createdAt <= ${endDate}
          ${module !== "ALL" ? prisma.$queryRaw`AND module = ${module}` : prisma.$queryRaw``}
        GROUP BY DATE(createdAt)
        ORDER BY date ASC
      `,

        // Top vendors
        prisma.order.groupBy({
          by: ["vendorId"],
          where: {
            ...moduleWhere,
            vendorId: { not: null },
            status: "DELIVERED",
            createdAt: { gte: startDate, lte: endDate },
          },
          _sum: { total: true },
          _count: true,
          orderBy: { _sum: { total: "desc" } },
          take: 10,
        }),

        // Top products
        prisma.orderItem.groupBy({
          by: ["productId"],
          where: {
            order: {
              ...moduleWhere,
              status: "DELIVERED",
              createdAt: { gte: startDate, lte: endDate },
            },
          },
          _sum: { quantity: true, price: true },
          _count: true,
          orderBy: { _sum: { quantity: "desc" } },
          take: 10,
        }),

        // User growth calculation
        Promise.all([
          prisma.user.count({
            where: {
              createdAt: { gte: startDate, lte: endDate },
            },
          }),
          prisma.user.count({
            where: {
              createdAt: {
                gte: new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime())),
                lt: startDate,
              },
            },
          }),
        ]),

        // Revenue growth calculation
        Promise.all([
          prisma.order.aggregate({
            where: {
              ...moduleWhere,
              status: "DELIVERED",
              createdAt: { gte: startDate, lte: endDate },
            },
            _sum: { total: true },
          }),
          prisma.order.aggregate({
            where: {
              ...moduleWhere,
              status: "DELIVERED",
              createdAt: {
                gte: new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime())),
                lt: startDate,
              },
            },
            _sum: { total: true },
          }),
        ]),
      ])

    // Get vendor details
    const topVendorsWithDetails = await Promise.all(
      topVendors.map(async (vendor) => {
        if (!vendor.vendorId) return null
        const vendorDetails = await prisma.user.findUnique({
          where: { id: vendor.vendorId },
          select: { name: true, email: true },
        })
        return {
          id: vendor.vendorId,
          name: vendorDetails?.name || "Unknown",
          module: "UNKNOWN", // You'd need to determine this from the vendor's business type
          revenue: vendor._sum.total || 0,
          orders: vendor._count,
        }
      }),
    )

    // Get product details
    const topProductsWithDetails = await Promise.all(
      topProducts.map(async (product) => {
        if (!product.productId) return null
        // You'd need to query the appropriate product table based on module
        return {
          id: product.productId,
          name: `Product ${product.productId}`, // Replace with actual product name lookup
          category: "Unknown",
          sales: product._sum.quantity || 0,
          revenue: product._sum.price || 0,
        }
      }),
    )

    // Calculate growth percentages
    const [currentUsers, previousUsers] = userGrowth
    const [currentRevenue, previousRevenue] = revenueGrowth

    const userGrowthPercent = previousUsers > 0 ? ((currentUsers - previousUsers) / previousUsers) * 100 : 0
    const revenueGrowthPercent =
      (previousRevenue._sum.total || 0) > 0
        ? (((overviewStats[0]._sum.total || 0) - (previousRevenue._sum.total || 0)) /
            (previousRevenue._sum.total || 0)) *
          100
        : 0

    // Format module breakdown
    const moduleBreakdownFormatted: { [key: string]: any } = {}
    moduleBreakdown.forEach((module) => {
      moduleBreakdownFormatted[module.module.toLowerCase()] = {
        revenue: module._sum.total || 0,
        orders: module._count,
        users: 0, // You'd need a separate query for users per module
        growth: 0, // You'd need historical data for growth calculation
      }
    })

    const analytics = {
      overview: {
        totalRevenue: overviewStats[0]._sum.total || 0,
        totalUsers: overviewStats[1],
        totalOrders: overviewStats[2],
        averageOrderValue: overviewStats[3]._avg.total || 0,
        revenueGrowth: revenueGrowthPercent,
        userGrowth: userGrowthPercent,
      },
      moduleBreakdown: moduleBreakdownFormatted,
      timeSeriesData: timeSeriesData as any[],
      topPerformers: {
        vendors: topVendorsWithDetails.filter(Boolean),
        products: topProductsWithDetails.filter(Boolean),
      },
    }

    return NextResponse.json(analytics)
  } catch (error) {
    console.error("Error fetching analytics:", error)
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 })
  }
}
