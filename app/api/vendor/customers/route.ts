import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const vendorId = user.id

    const { searchParams } = new URL(request.url)
    const tier = searchParams.get("tier")
    const sortBy = searchParams.get("sortBy") || "totalSpent"
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const skip = (page - 1) * limit

    // Get all customers who have ordered from this vendor
    const orders = await prisma.order.findMany({
      where: {
        vendorId,
        status: "DELIVERED",
      },
      include: {
        customer: true,
        orderItems: {
          include: {
            item: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    })

    // Group orders by customer and calculate metrics
    const customerMetrics = new Map()

    orders.forEach((order) => {
      const customerId = order.customerId

      if (!customerMetrics.has(customerId)) {
        customerMetrics.set(customerId, {
          id: customerId,
          name: order.customer.name,
          email: order.customer.email,
          phone: order.customer.phone,
          avatar: order.customer.avatar,
          joinedDate: order.customer.createdAt,
          totalOrders: 0,
          totalSpent: 0,
          lastOrderDate: order.createdAt,
          orders: [],
        })
      }

      const metrics = customerMetrics.get(customerId)
      metrics.totalOrders += 1
      metrics.totalSpent += order.totalAmount
      metrics.orders.push(order)

      if (new Date(order.createdAt) > new Date(metrics.lastOrderDate)) {
        metrics.lastOrderDate = order.createdAt
      }

      // Track category purchases
      order.items.forEach((item) => {
        const categoryName = item.product.category?.name || "Other"
        const currentCount = metrics.categoryPurchases.get(categoryName) || 0
        metrics.categoryPurchases.set(categoryName, currentCount + item.quantity)
      })
    })

    // Convert to array and calculate additional metrics
    const customers = Array.from(customerMetrics.values()).map((customer) => {
      const averageOrderValue = customer.totalSpent / customer.totalOrders

      // Determine tier based on total spent
      let tier = "bronze"
      if (customer.totalSpent >= 100000) tier = "platinum"
      else if (customer.totalSpent >= 50000) tier = "gold"
      else if (customer.totalSpent >= 20000) tier = "silver"

      // Get top 3 favorite categories
      const favoriteCategories = Array.from(customer.categoryPurchases.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([category]) => category)

      // Determine status based on last order
      const daysSinceLastOrder = Math.floor(
        (Date.now() - new Date(customer.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24),
      )
      const status = daysSinceLastOrder <= 30 ? "active" : "inactive"

      return {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        avatar: customer.avatar,
        totalOrders: customer.totalOrders,
        totalSpent: customer.totalSpent,
        loyaltyPoints: customer.loyaltyPoints,
        lastOrderDate: customer.lastOrderDate,
        joinedDate: customer.joinedDate,
        averageOrderValue,
        tier,
        status,
        favoriteCategories,
      }
    })

    // Filter by tier if specified
    let filteredCustomers = customers
    if (tier && tier !== "all") {
      filteredCustomers = customers.filter((customer) => customer.tier === tier)
    }

    // Sort customers
    filteredCustomers.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name)
        case "totalSpent":
          return b.totalSpent - a.totalSpent
        case "totalOrders":
          return b.totalOrders - a.totalOrders
        case "lastOrder":
          return new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime()
        default:
          return b.totalSpent - a.totalSpent
      }
    })

    // Paginate results
    const paginatedCustomers = filteredCustomers.slice(skip, skip + limit)

    return NextResponse.json({
      customers: paginatedCustomers,
      pagination: {
        page,
        limit,
        total: filteredCustomers.length,
        pages: Math.ceil(filteredCustomers.length / limit),
      },
      summary: {
        totalCustomers: customers.length,
        activeCustomers: customers.filter((c) => c.status === "active").length,
        totalRevenue: customers.reduce((sum, c) => sum + c.totalSpent, 0),
        averageOrderValue: customers.reduce((sum, c) => sum + c.averageOrderValue, 0) / customers.length,
        tierDistribution: {
          platinum: customers.filter((c) => c.tier === "platinum").length,
          gold: customers.filter((c) => c.tier === "gold").length,
          silver: customers.filter((c) => c.tier === "silver").length,
          bronze: customers.filter((c) => c.tier === "bronze").length,
        },
      },
    })
  } catch (error) {
    console.error("Error fetching customers:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
