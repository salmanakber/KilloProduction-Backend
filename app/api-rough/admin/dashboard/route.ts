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

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const startOfWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

    // Get comprehensive analytics
    const [
      totalUsers,
      totalCustomers,
      totalVendors,
      totalRiders,
      activeUsers,
      totalOrders,
      todayOrders,
      weekOrders,
      monthOrders,
      totalRevenue,
      todayRevenue,
      weekRevenue,
      monthRevenue,
      ordersByModule,
      ordersByStatus,
      topVendors,
      topRiders,
      recentUsers,
      recentOrders,
      systemHealth,
    ] = await Promise.all([
      // User counts
      prisma.user.count(),
      prisma.user.count({ where: { role: "CUSTOMER" } }),
      prisma.user.count({ where: { role: "VENDOR" } }),
      prisma.user.count({ where: { role: "RIDER" } }),
      prisma.user.count({ where: { isActive: true } }),

      // Order counts
      prisma.order.count(),
      prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.order.count({ where: { createdAt: { gte: startOfWeek } } }),
      prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),

      // Revenue
      prisma.order.aggregate({ _sum: { total: true } }),
      prisma.order.aggregate({
        where: { createdAt: { gte: startOfDay } },
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { createdAt: { gte: startOfWeek } },
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { createdAt: { gte: startOfMonth } },
        _sum: { total: true },
      }),

      // Orders by module
      prisma.order.groupBy({
        by: ["module"],
        _count: true,
        _sum: { total: true },
      }),

      // Orders by status
      prisma.order.groupBy({
        by: ["status"],
        _count: true,
      }),

      // Top vendors
      prisma.order.groupBy({
        by: ["vendorId"],
        where: { vendorId: { not: null } },
        _count: true,
        _sum: { total: true },
        orderBy: { _sum: { total: "desc" } },
        take: 10,
      }),

      // Top riders
      prisma.order.groupBy({
        by: ["riderId"],
        where: { riderId: { not: null } },
        _count: true,
        _sum: { deliveryFee: true },
        orderBy: { _count: { riderId: "desc" } },
        take: 10,
      }),

      // Recent users
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isVerified: true,
          createdAt: true,
        },
      }),

      // Recent orders
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          customer: { select: { name: true } },
          vendor: { select: { businessName: true } },
        },
      }),

      // System health (mock data)
      {
        serverUptime: "99.9%",
        apiResponseTime: "120ms",
        databaseConnections: 45,
        activeConnections: 234,
        errorRate: "0.1%",
      },
    ])

    const analytics = {
      users: {
        total: totalUsers,
        customers: totalCustomers,
        vendors: totalVendors,
        riders: totalRiders,
        active: activeUsers,
      },
      orders: {
        total: totalOrders,
        today: todayOrders,
        week: weekOrders,
        month: monthOrders,
        byModule: ordersByModule,
        byStatus: ordersByStatus,
      },
      revenue: {
        total: totalRevenue._sum.total || 0,
        today: todayRevenue._sum.total || 0,
        week: weekRevenue._sum.total || 0,
        month: monthRevenue._sum.total || 0,
      },
      topVendors,
      topRiders,
      recentUsers,
      recentOrders,
      systemHealth,
    }

    return NextResponse.json({ analytics })
  } catch (error) {
    console.error("Error fetching admin dashboard:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
