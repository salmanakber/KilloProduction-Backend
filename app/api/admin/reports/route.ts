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

    // Build where clause for module filter
    const moduleWhere = module !== "ALL" ? { module } : {}

    // Get comprehensive report data
    const [
      totalRevenue,
      totalOrders,
      totalUsers,
      revenueByModule,
      ordersByStatus,
      usersByRole,
      topVendors,
      topProducts,
      dailyRevenue,
      monthlyGrowth,
    ] = await Promise.all([
      // Total revenue in date range
      prisma.order.aggregate({
        where: {
          ...moduleWhere,
          status: "DELIVERED",
          createdAt: { gte: startDate, lte: endDate },
        },
        _sum: { total: true },
      }),

      // Total orders in date range
      prisma.order.count({
        where: {
          ...moduleWhere,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),

      // Total users in date range
      prisma.user.count({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
      }),

      // Revenue breakdown by module
      prisma.order.groupBy({
        by: ["module"],
        where: {
          status: "DELIVERED",
          createdAt: { gte: startDate, lte: endDate },
        },
        _sum: { total: true },
        _count: true,
      }),

      // Orders by status
      prisma.order.groupBy({
        by: ["status"],
        where: {
          ...moduleWhere,
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: true,
      }),

      // Users by role
      prisma.user.groupBy({
        by: ["role"],
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: true,
      }),

      // Top vendors by revenue
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

      // Top products by sales (using order items)
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

      // Daily revenue trend
      prisma.$queryRaw`
        SELECT 
          DATE(createdAt) as date,
          SUM(total) as revenue,
          COUNT(*) as orders
        FROM orders 
        WHERE status = 'DELIVERED'
          AND createdAt >= ${startDate}
          AND createdAt <= ${endDate}
          ${module !== "ALL" ? prisma.$queryRaw`AND module = ${module}` : prisma.$queryRaw``}
        GROUP BY DATE(createdAt)
        ORDER BY date ASC
      `,

      // Monthly growth comparison
      prisma.$queryRaw`
        SELECT 
          DATE_FORMAT(createdAt, '%Y-%m') as month,
          SUM(total) as revenue,
          COUNT(*) as orders
        FROM orders 
        WHERE status = 'DELIVERED'
          AND createdAt >= DATE_SUB(${endDate}, INTERVAL 12 MONTH)
          ${module !== "ALL" ? prisma.$queryRaw`AND module = ${module}` : prisma.$queryRaw``}
        GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
        ORDER BY month ASC
      `,
    ])

    // Get vendor details for top vendors
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
          email: vendorDetails?.email || "",
          revenue: vendor._sum.total || 0,
          orders: vendor._count,
        }
      }),
    )

    const reportData = {
      summary: {
        totalRevenue: totalRevenue._sum.total || 0,
        totalOrders,
        totalUsers,
        dateRange: { start: startDate, end: endDate },
      },
      breakdown: {
        revenueByModule,
        ordersByStatus,
        usersByRole,
      },
      topPerformers: {
        vendors: topVendorsWithDetails.filter(Boolean),
        products: topProducts, // You might want to get product details here too
      },
      trends: {
        daily: dailyRevenue,
        monthly: monthlyGrowth,
      },
    }

    return NextResponse.json({ reportData })
  } catch (error) {
    console.error("Error generating report:", error)
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 })
  }
}
