import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { parseAdminRange, previousWindow } from "@/lib/adminDateRange"

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get("range") || "7d"
    const { start: startDate, end: endDate } = parseAdminRange(range)
    const prev = previousWindow(startDate, endDate)
    const dateWhere = { gte: startDate, lte: endDate }

    const defaultCurrency = await prisma.currency.findFirst({
      where: { isDefault: true },
      select: { symbol: true },
    })
    const currencySymbol = defaultCurrency?.symbol || "₦"

    const [
      totalUsers,
      totalOrders,
      totalRevenue,
      prevRevenue,
      activeTickets,
      resolvedTickets,
      moduleStats,
      auditRows,
      recentOrders,
      paymentWalletVol,
      paymentGatewayVol,
      pendingWithdrawals,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.order.count({ where: { createdAt: dateWhere } }),
      prisma.order.aggregate({
        where: { createdAt: dateWhere, status: "DELIVERED" },
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { createdAt: { gte: prev.start, lte: prev.end }, status: "DELIVERED" },
        _sum: { total: true },
      }),
      prisma.supportTicket.count({
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      }),
      prisma.supportTicket.count({
        where: {
          status: { in: ["RESOLVED", "CLOSED"] },
          updatedAt: dateWhere,
        },
      }),
      Promise.all([
        Promise.all([
          prisma.user.count({ where: { role: "VENDOR", pharmacy: { isNot: null } } }),
          prisma.order.count({ where: { module: "PHARMACY", createdAt: dateWhere } }),
          prisma.order.aggregate({
            where: { module: "PHARMACY", createdAt: dateWhere, status: "DELIVERED" },
            _sum: { total: true },
          }),
        ]),
        Promise.all([
          prisma.user.count({ where: { role: "VENDOR", autoPartsStore: { isNot: null } } }),
          prisma.order.count({ where: { module: "AUTO_PARTS", createdAt: dateWhere } }),
          prisma.order.aggregate({
            where: { module: "AUTO_PARTS", createdAt: dateWhere, status: "DELIVERED" },
            _sum: { total: true },
          }),
        ]),
        Promise.all([
          prisma.user.count({ where: { role: "VENDOR", restaurant: { isNot: null } } }),
          prisma.order.count({ where: { module: "FOOD", createdAt: dateWhere } }),
          prisma.order.aggregate({
            where: { module: "FOOD", createdAt: dateWhere, status: "DELIVERED" },
            _sum: { total: true },
          }),
        ]),
        Promise.all([
          prisma.user.count({ where: { role: "VENDOR", groceryStore: { isNot: null } } }),
          prisma.order.count({ where: { module: "GROCERY", createdAt: dateWhere } }),
          prisma.order.aggregate({
            where: { module: "GROCERY", createdAt: dateWhere, status: "DELIVERED" },
            _sum: { total: true },
          }),
        ]),
        Promise.all([
          prisma.user.count({ where: { role: "RIDER" } }),
          prisma.rideBooking.count({ where: { createdAt: dateWhere } }),
          prisma.rideBooking.aggregate({
            where: { createdAt: dateWhere, status: "COMPLETED" },
            _sum: { finalFare: true },
          }),
        ]),
      ]),
      prisma.auditLog.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: { performer: { select: { name: true, email: true } } },
      }),
      prisma.order.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        where: { createdAt: dateWhere },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          module: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      }),
      prisma.walletTransaction.aggregate({
        where: { status: "COMPLETED", createdAt: dateWhere },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { status: "PAID", createdAt: dateWhere },
        _sum: { amount: true },
      }),
      prisma.vendorWithdrawal.count({ where: { status: "PENDING" } }),
    ])

    const [pharmacyStats, autoPartsStats, foodStats, groceryStats, ridingStats] = moduleStats

    const processedModuleStats = {
      pharmacy: {
        users: pharmacyStats[0],
        orders: pharmacyStats[1],
        revenue: pharmacyStats[2]._sum.total || 0,
      },
      autoParts: {
        users: autoPartsStats[0],
        orders: autoPartsStats[1],
        revenue: autoPartsStats[2]._sum.total || 0,
      },
      food: {
        users: foodStats[0],
        orders: foodStats[1],
        revenue: foodStats[2]._sum.total || 0,
      },
      grocery: {
        users: groceryStats[0],
        orders: groceryStats[1],
        revenue: groceryStats[2]._sum.total || 0,
      },
      riding: {
        users: ridingStats[0],
        orders: ridingStats[1],
        revenue: ridingStats[2]._sum.finalFare || 0,
      },
    }

    const moduleChartData = [
      { key: "pharmacy", name: "Pharmacy", revenue: processedModuleStats.pharmacy.revenue, orders: processedModuleStats.pharmacy.orders },
      { key: "autoParts", name: "Auto parts", revenue: processedModuleStats.autoParts.revenue, orders: processedModuleStats.autoParts.orders },
      { key: "food", name: "Food", revenue: processedModuleStats.food.revenue, orders: processedModuleStats.food.orders },
      { key: "grocery", name: "Grocery", revenue: processedModuleStats.grocery.revenue, orders: processedModuleStats.grocery.orders },
      { key: "riding", name: "Rides", revenue: processedModuleStats.riding.revenue, orders: processedModuleStats.riding.orders },
    ]

    const fromAudit = auditRows.map((a) => ({
      id: a.id,
      type: a.action,
      message: `${a.action.replace(/_/g, " ")} · ${a.entityType}`,
      timestamp: a.createdAt.toISOString(),
      user: a.performer?.name || a.performer?.email || "System",
    }))

    const fromOrders = recentOrders.map((o) => ({
      id: `ord-${o.id}`,
      type: "ORDER",
      message: `Order ${o.orderNumber} (${o.module}) — ${o.status} · ${currencySymbol}${o.total.toLocaleString()}`,
      timestamp: o.createdAt.toISOString(),
      user: o.customer?.name || "Customer",
    }))

    const recentActivities = [...fromAudit, ...fromOrders]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 12)

    const rev = totalRevenue._sum.total || 0
    const prevR = prevRevenue._sum.total || 0
    const monthlyGrowth =
      prevR > 0 ? Math.round(((rev - prevR) / prevR) * 1000) / 10 : rev > 0 ? 100 : 0

    return NextResponse.json({
      currencySymbol,
      totalUsers,
      totalOrders,
      totalRevenue: rev,
      monthlyGrowth,
      activeComplaints: activeTickets,
      resolvedComplaints: resolvedTickets,
      moduleStats: processedModuleStats,
      moduleChartData,
      recentActivities,
      paymentSummary: {
        walletVolume: paymentWalletVol._sum.amount || 0,
        gatewayVolume: paymentGatewayVol._sum.amount || 0,
        pendingWithdrawals,
      },
    })
  } catch (err) {
    console.error("Error fetching admin dashboard stats:", err)
    return NextResponse.json({ error: "Failed to fetch dashboard stats" }, { status: 500 })
  }
}
