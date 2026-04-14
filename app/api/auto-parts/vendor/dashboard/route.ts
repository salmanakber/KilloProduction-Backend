import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get vendor profile
    const vendorProfile = await prisma.vendorProfile.findUnique({
      where: { userId: user.id },
      select: {
        businessName: true,
        city: true,
        state: true,
      },
    })

    // Time helpers
    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const startOfWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

    // Get analytics
    const [
      totalOrders, 
      totalRevenue, 
      totalProducts, 
      pendingOrders,
      todayRevenue,
      weekRevenue,
      monthRevenue,
      completedOrders,
      cancelledOrders,
      averageOrderValue,
    ] = await Promise.all([
      prisma.order.count({
        where: {
          vendorId: user.id,
          module: "AUTO_PARTS",
        },
      }),
      prisma.order.aggregate({
        where: {
          vendorId: user.id,
          module: "AUTO_PARTS",
          status: { in: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"] },
        },
        _sum: {
          total: true,
        },
      }),
      prisma.product.count({
        where: {
          vendorId: user.id,
          type: "AUTO_PART",
          isActive: true,
        },
      }),
      prisma.order.count({
        where: {
          vendorId: user.id,
          module: "AUTO_PARTS",
          status: "PENDING",
        },
      }),
      // Today's revenue
      prisma.order.aggregate({
        where: {
          vendorId: user.id,
          module: "AUTO_PARTS",
          status: { in: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"] },
          createdAt: { gte: startOfDay },
        },
        _sum: { total: true },
      }),
      // Week's revenue
      prisma.order.aggregate({
        where: {
          vendorId: user.id,
          module: "AUTO_PARTS",
          status: { in: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"] },
          createdAt: { gte: startOfWeek },
        },
        _sum: { total: true },
      }),
      // Month's revenue
      prisma.order.aggregate({
        where: {
          vendorId: user.id,
          module: "AUTO_PARTS",
          status: { in: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"] },
          createdAt: { gte: startOfMonth },
        },
        _sum: { total: true },
      }),
      // Completed orders
      prisma.order.count({
        where: {
          vendorId: user.id,
          module: "AUTO_PARTS",
          status: "DELIVERED",
        },
      }),
      // Cancelled orders
      prisma.order.count({
        where: {
          vendorId: user.id,
          module: "AUTO_PARTS",
          status: "CANCELLED",
        },
      }),
      // Average order value
      prisma.order.aggregate({
        where: {
          vendorId: user.id,
          module: "AUTO_PARTS",
          status: { in: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"] },
        },
        _avg: { total: true },
      }),
    ])

    // Get recent orders (exclude DELIVERED, COMPLETED, and CANCELLED - show in order history instead)
    const recentOrders = await prisma.order.findMany({
      where: {
        vendorId: user.id,
        module: "AUTO_PARTS",
        status: {
          notIn: ["DELIVERED", "REFUNDED", "CANCELLED"],
        },
      },
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    })

    // Get top products by sales count
    // First get all order items for this vendor's orders
    const vendorOrderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          vendorId: user.id,
          module: "AUTO_PARTS",
          status: { in: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"] },
        },
      },
      select: {
        productId: true,
        quantity: true,
      },
    })

    // Group by productId and calculate totals
    const productSalesMap = new Map<string, { count: number; quantity: number }>()
    vendorOrderItems.forEach(item => {
      if (item.productId) {
        const existing = productSalesMap.get(item.productId) || { count: 0, quantity: 0 }
        productSalesMap.set(item.productId, {
          count: existing.count + 1,
          quantity: existing.quantity + (item.quantity || 0),
        })
      }
    })

    // Get top 5 product IDs by quantity
    const topProductIds = Array.from(productSalesMap.entries())
      .sort((a, b) => b[1].quantity - a[1].quantity)
      .slice(0, 5)
      .map(([productId]) => productId)

    // Get product details
    const topProducts = await prisma.product.findMany({
      where: {
        id: { in: topProductIds },
        vendorId: user.id,
        type: "AUTO_PART",
        isActive: true,
      },
    })

    // Map sales count to products
    const topProductsWithSales = topProducts.map(product => {
      const salesData = productSalesMap.get(product.id)
      return {
        ...product,
        salesCount: salesData?.count || 0,
        totalQuantity: salesData?.quantity || 0,
      }
    }).sort((a, b) => (b.totalQuantity || 0) - (a.totalQuantity || 0))

    // Get matching part requests (open requests in vendor's city)
    const partRequests = await prisma.partRequest.findMany({
      where: {
        status: "OPEN",
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
        offers: {
          where: {
            vendorId: user.id,
          },
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    })

    return NextResponse.json({
      analytics: {
        totalOrders,
        totalRevenue: totalRevenue._sum.total || 0,
        totalProducts,
        pendingOrders,
        todayRevenue: todayRevenue._sum.total || 0,
        weekRevenue: weekRevenue._sum.total || 0,
        monthRevenue: monthRevenue._sum.total || 0,
        completedOrders,
        cancelledOrders,
        averageOrderValue: averageOrderValue._avg.total || 0,
      },
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customer: order.customer,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt,
      })),
      topProducts: topProductsWithSales.map((product) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        stockQuantity: product.stockQuantity,
        salesCount: product.salesCount || 0,
        totalQuantity: product.totalQuantity || 0,
      })),
      partRequests: partRequests.map((req) => ({
        id: req.id,
        partName: req.partName,
        partType: req.partType,
        vehicleBrand: req.vehicleBrand,
        vehicleModel: req.vehicleModel,
        vehicleYear: req.vehicleYear,
        urgency: req.urgency,
        maxBudget: req.maxBudget,
        status: req.status,
        hasOffer: req.offers.length > 0,
        createdAt: req.createdAt,
      })),
      store: {
        storeName: vendorProfile?.businessName || user.name,
        city: vendorProfile?.city,
        state: vendorProfile?.state,
        verificationStatus: "VERIFIED", // You can add verification logic later
      },
    })
  } catch (error) {
    console.error("Dashboard fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}

