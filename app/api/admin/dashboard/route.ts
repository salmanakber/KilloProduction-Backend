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
      pendingWithdrawals,
      totalCommissions,
      activeComplaints,
      resolvedComplaints,
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
      prisma.order.aggregate({
        where: { status: "DELIVERED" },
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: {
          createdAt: { gte: startOfDay },
          status: "DELIVERED",
        },
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: {
          createdAt: { gte: startOfWeek },
          status: "DELIVERED",
        },
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: {
          createdAt: { gte: startOfMonth },
          status: "DELIVERED",
        },
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

      // Top vendors by revenue
      prisma.order.groupBy({
        by: ["vendorId"],
        where: {
          vendorId: { not: null },
          status: "DELIVERED",
        },
        _count: true,
        _sum: { total: true },
        orderBy: { _sum: { total: "desc" } },
        take: 10,
      }),

      // Top riders by deliveries
      prisma.order.groupBy({
        by: ["riderId"],
        where: { riderId: { not: null } },
        _count: true,
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
          vendor: { select: { name: true } },
        },
      }),

      // Pending withdrawals
      prisma.vendorWithdrawal.aggregate({
        where: { status: "PENDING" },
        _sum: { amount: true },
        _count: true,
      }),

      // Total commissions earned
      prisma.vendorCommission.aggregate({
        where: { status: "PAID" },
        _sum: { commissionAmount: true },
      }),

      // Active complaints
      prisma.supportTicket.count({
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      }),

      // Resolved complaints
      prisma.supportTicket.count({
        where: { status: "RESOLVED" },
      }),
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
          totalRevenue: vendor._sum.total || 0,
          orderCount: vendor._count,
        }
      }),
    )

    // Get rider details for top riders
    const topRidersWithDetails = await Promise.all(
      topRiders.map(async (rider) => {
        if (!rider.riderId) return null
        const riderDetails = await prisma.user.findUnique({
          where: { id: rider.riderId },
          select: { name: true, phone: true },
        })
        return {
          id: rider.riderId,
          name: riderDetails?.name || "Unknown",
          phone: riderDetails?.phone || "",
          deliveryCount: rider._count,
        }
      }),
    )

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
      withdrawals: {
        pending: pendingWithdrawals._count || 0,
        pendingAmount: pendingWithdrawals._sum.amount || 0,
      },
      commissions: {
        total: totalCommissions._sum.commissionAmount || 0,
      },
      support: {
        activeComplaints,
        resolvedComplaints,
      },
      topVendors: topVendorsWithDetails.filter(Boolean),
      topRiders: topRidersWithDetails.filter(Boolean),
      recentUsers,
      recentOrders,
    }

    return NextResponse.json({ analytics })
  } catch (error) {
    console.error("Error fetching admin dashboard:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
