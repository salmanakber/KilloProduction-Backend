import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = verifyToken(token)
    const vendorId = decoded.userId

    const { searchParams } = new URL(request.url)
    const reportType = searchParams.get("type") || "sales"
    const period = searchParams.get("period") || "30" // days
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    // Calculate date range
    const end = endDate ? new Date(endDate) : new Date()
    const start = startDate ? new Date(startDate) : new Date(Date.now() - Number.parseInt(period) * 24 * 60 * 60 * 1000)

    const dateFilter = {
      createdAt: {
        gte: start,
        lte: end,
      },
    }

    switch (reportType) {
      case "sales":
        return await generateSalesReport(vendorId, dateFilter)
      case "products":
        return await generateProductReport(vendorId, dateFilter)
      case "customers":
        return await generateCustomerReport(vendorId, dateFilter)
      case "inventory":
        return await generateInventoryReport(vendorId)
      default:
        return NextResponse.json({ error: "Invalid report type" }, { status: 400 })
    }
  } catch (error) {
    console.error("Error generating report:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function generateSalesReport(vendorId: string, dateFilter: any) {
  const [orders, previousPeriodOrders] = await Promise.all([
    prisma.order.findMany({
      where: {
        vendorId,
        status: "DELIVERED",
        ...dateFilter,
      },
      include: {
        items: true,
      },
    }),
    prisma.order.findMany({
      where: {
        vendorId,
        status: "DELIVERED",
        createdAt: {
          gte: new Date(
            dateFilter.createdAt.gte.getTime() -
              (dateFilter.createdAt.lte.getTime() - dateFilter.createdAt.gte.getTime()),
          ),
          lt: dateFilter.createdAt.gte,
        },
      },
    }),
  ])

  const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0)
  const totalOrders = orders.length
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
  const totalItems = orders.reduce((sum, order) => sum + order.items.length, 0)

  const previousRevenue = previousPeriodOrders.reduce((sum, order) => sum + order.totalAmount, 0)
  const revenueGrowth = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0

  // Daily sales breakdown
  const dailySales = new Map()
  orders.forEach((order) => {
    const date = order.createdAt.toISOString().split("T")[0]
    const current = dailySales.get(date) || { revenue: 0, orders: 0 }
    dailySales.set(date, {
      revenue: current.revenue + order.totalAmount,
      orders: current.orders + 1,
    })
  })

  const salesChart = Array.from(dailySales.entries())
    .map(([date, data]) => ({
      date,
      revenue: data.revenue,
      orders: data.orders,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({
    summary: {
      totalRevenue,
      totalOrders,
      averageOrderValue,
      totalItems,
      revenueGrowth,
    },
    chart: salesChart,
    topProducts: await getTopProducts(vendorId, dateFilter),
  })
}

async function generateProductReport(vendorId: string, dateFilter: any) {
  const products = await prisma.product.findMany({
    where: { vendorId },
    include: {
      orderItems: {
        where: {
          order: {
            status: "DELIVERED",
            ...dateFilter,
          },
        },
      },
      reviews: true,
      _count: {
        select: {
          orderItems: true,
          reviews: true,
        },
      },
    },
  })

  const productMetrics = products.map((product) => {
    const totalSold = product.orderItems.reduce((sum, item) => sum + item.quantity, 0)
    const totalRevenue = product.orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const averageRating =
      product.reviews.length > 0
        ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
        : 0

    return {
      id: product.id,
      name: product.name,
      totalSold,
      totalRevenue,
      averageRating,
      reviewCount: product._count.reviews,
      stockLevel: product.stockQuantity,
      lowStock: product.stockQuantity <= product.minStockLevel,
    }
  })

  // Sort by revenue
  productMetrics.sort((a, b) => b.totalRevenue - a.totalRevenue)

  return NextResponse.json({
    products: productMetrics,
    summary: {
      totalProducts: products.length,
      lowStockProducts: productMetrics.filter((p) => p.lowStock).length,
      topPerformer: productMetrics[0]?.name || "N/A",
      totalRevenue: productMetrics.reduce((sum, p) => sum + p.totalRevenue, 0),
    },
  })
}

async function generateCustomerReport(vendorId: string, dateFilter: any) {
  const orders = await prisma.order.findMany({
    where: {
      vendorId,
      status: "DELIVERED",
      ...dateFilter,
    },
    include: {
      customer: true,
    },
  })

  const customerMetrics = new Map()
  orders.forEach((order) => {
    const customerId = order.customerId
    if (!customerMetrics.has(customerId)) {
      customerMetrics.set(customerId, {
        customer: order.customer,
        totalOrders: 0,
        totalSpent: 0,
        lastOrderDate: order.createdAt,
      })
    }

    const metrics = customerMetrics.get(customerId)
    metrics.totalOrders += 1
    metrics.totalSpent += order.totalAmount
    if (order.createdAt > metrics.lastOrderDate) {
      metrics.lastOrderDate = order.createdAt
    }
  })

  const customers = Array.from(customerMetrics.values())
    .map(({ customer, totalOrders, totalSpent, lastOrderDate }) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      totalOrders,
      totalSpent,
      averageOrderValue: totalSpent / totalOrders,
      lastOrderDate,
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent)

  return NextResponse.json({
    customers: customers.slice(0, 50), // Top 50 customers
    summary: {
      totalCustomers: customers.length,
      newCustomers: customers.filter((c) => new Date(c.lastOrderDate) >= dateFilter.createdAt.gte).length,
      topSpender: customers[0]?.name || "N/A",
      averageOrderValue: customers.reduce((sum, c) => sum + c.averageOrderValue, 0) / customers.length || 0,
    },
  })
}

async function generateInventoryReport(vendorId: string) {
  const products = await prisma.product.findMany({
    where: { vendorId },
    include: {
      inventoryTransactions: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  })

  const inventoryMetrics = products.map((product) => ({
    id: product.id,
    name: product.name,
    currentStock: product.stockQuantity,
    minStockLevel: product.minStockLevel,
    maxStockLevel: product.maxStockLevel,
    stockStatus:
      product.stockQuantity === 0
        ? "out_of_stock"
        : product.stockQuantity <= product.minStockLevel
          ? "low_stock"
          : "in_stock",
    recentTransactions: product.inventoryTransactions,
  }))

  const lowStockProducts = inventoryMetrics.filter((p) => p.stockStatus === "low_stock")
  const outOfStockProducts = inventoryMetrics.filter((p) => p.stockStatus === "out_of_stock")

  return NextResponse.json({
    products: inventoryMetrics,
    alerts: {
      lowStock: lowStockProducts,
      outOfStock: outOfStockProducts,
    },
    summary: {
      totalProducts: products.length,
      lowStockCount: lowStockProducts.length,
      outOfStockCount: outOfStockProducts.length,
      totalStockValue: inventoryMetrics.reduce((sum, p) => sum + p.currentStock * 0, 0), // Would need product price
    },
  })
}

async function getTopProducts(vendorId: string, dateFilter: any) {
  const topProducts = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      order: {
        vendorId,
        status: "DELIVERED",
        ...dateFilter,
      },
    },
    _sum: {
      quantity: true,
    },
    _count: {
      id: true,
    },
    orderBy: {
      _sum: {
        quantity: "desc",
      },
    },
    take: 10,
  })

  const productDetails = await prisma.product.findMany({
    where: {
      id: {
        in: topProducts.map((p) => p.productId),
      },
    },
    select: {
      id: true,
      name: true,
      images: true,
      price: true,
    },
  })

  return topProducts.map((item) => {
    const product = productDetails.find((p) => p.id === item.productId)
    return {
      id: item.productId,
      name: product?.name || "Unknown",
      image: product?.images?.[0],
      price: product?.price || 0,
      totalSold: item._sum.quantity || 0,
      orderCount: item._count.id,
    }
  })
}
