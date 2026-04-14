import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateFromCookie } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateFromCookie(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get("period") || "30" // days

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(period))

    // Get basic counts
    const [
      totalWholesalers,
      verifiedWholesalers,
      pendingWholesalers,
      activeWholesalers,
      totalProducts,
      totalOrders,
      totalRevenue,
      averageRating,
      recentWholesalers,
      topWholesalers,
      orderStats,
      revenueStats,
    ] = await Promise.all([
      // Total wholesalers
      prisma.wholesaler.count(),

      // Verified wholesalers
      prisma.wholesaler.count({
        where: { isVerified: true },
      }),

      // Pending wholesalers
      prisma.wholesaler.count({
        where: { isVerified: false },
      }),

      // Active wholesalers (with active user accounts)
      prisma.wholesaler.count({
        where: { user: { isActive: true } },
      }),

      // Total products
      prisma.wholesalerProduct.count({
        where: { isActive: true },
      }),

      // Total orders
      prisma.supplierOrder.count(),

      // Total revenue
      prisma.supplierOrder.aggregate({
        where: {
          status: { in: ["DELIVERED"] },
        },
        _sum: { totalAmount: true },
      }),

      // Average rating
      prisma.wholesaler.aggregate({
        _avg: { rating: true },
      }),

      // Recent wholesalers (last 30 days)
      prisma.wholesaler.findMany({
        where: {
          createdAt: { gte: startDate },
        },
        select: {
          id: true,
          companyName: true,
          createdAt: true,
          isVerified: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),

      // Top performing wholesalers
      prisma.wholesaler.findMany({
        select: {
          id: true,
          companyName: true,
          rating: true,
          totalOrders: true,
          _count: {
            select: {
              wholesalerProducts: true,
            },
          },
        },
        orderBy: [
          { totalOrders: "desc" },
          { rating: "desc" },
        ],
        take: 5,
      }),

      // Order statistics by status
      prisma.supplierOrder.groupBy({
        by: ["status"],
        _count: { status: true },
        _sum: { totalAmount: true },
      }),

      // Revenue statistics by month (last 6 months)
      prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', "createdAt") as month,
          COUNT(*) as order_count,
          SUM("totalAmount") as total_revenue
        FROM supplier_orders 
        WHERE "createdAt" >= NOW() - INTERVAL '6 months'
        AND status IN ('DELIVERED')
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY month DESC
      `,
    ])

    // Calculate growth metrics
    const previousPeriodStart = new Date(startDate)
    previousPeriodStart.setDate(previousPeriodStart.getDate() - parseInt(period))

    const [
      currentPeriodWholesalers,
      previousPeriodWholesalers,
      currentPeriodOrders,
      previousPeriodOrders,
    ] = await Promise.all([
      // Current period wholesalers
      prisma.wholesaler.count({
        where: { createdAt: { gte: startDate } },
      }),

      // Previous period wholesalers
      prisma.wholesaler.count({
        where: {
          createdAt: {
            gte: previousPeriodStart,
            lt: startDate,
          },
        },
      }),

      // Current period orders
      prisma.supplierOrder.count({
        where: { createdAt: { gte: startDate } },
      }),

      // Previous period orders
      prisma.supplierOrder.count({
        where: {
          createdAt: {
            gte: previousPeriodStart,
            lt: startDate,
          },
        },
      }),
    ])

    // Calculate growth percentages
    const wholesalerGrowth = previousPeriodWholesalers > 0
      ? ((currentPeriodWholesalers - previousPeriodWholesalers) / previousPeriodWholesalers) * 100
      : currentPeriodWholesalers > 0 ? 100 : 0

    const orderGrowth = previousPeriodOrders > 0
      ? ((currentPeriodOrders - previousPeriodOrders) / previousPeriodOrders) * 100
      : currentPeriodOrders > 0 ? 100 : 0

    // Process order statistics
    const orderStatusStats = orderStats.reduce((acc, stat) => {
      acc[stat.status] = {
        count: stat._count.status,
        revenue: stat._sum.totalAmount || 0,
      }
      return acc
    }, {} as Record<string, { count: number; revenue: number }>)

    return NextResponse.json({
      // Basic metrics
      total: totalWholesalers,
      verified: verifiedWholesalers,
      pending: pendingWholesalers,
      active: activeWholesalers,
      totalProducts,
      totalOrders,
      totalRevenue: totalRevenue._sum.totalAmount || 0,
      averageRating: averageRating._avg.rating || 0,

      // Growth metrics
      growth: {
        wholesalers: {
          current: currentPeriodWholesalers,
          previous: previousPeriodWholesalers,
          percentage: wholesalerGrowth,
        },
        orders: {
          current: currentPeriodOrders,
          previous: previousPeriodOrders,
          percentage: orderGrowth,
        },
      },

      // Recent activity
      recentWholesalers,
      topWholesalers,

      // Detailed statistics
      orderStatusStats,
      revenueStats,

      // Period information
      period: parseInt(period),
      startDate: startDate.toISOString(),
    })
  } catch (error) {
    console.error("Wholesaler stats error:", error)
    return NextResponse.json({ error: "Failed to fetch statistics" }, { status: 500 })
  }
}
