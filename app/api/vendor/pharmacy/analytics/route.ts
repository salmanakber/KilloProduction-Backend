import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '30d'

    // Get pharmacy ID
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: session.id }
    })

    if (!pharmacy) {
      return NextResponse.json({ error: 'Pharmacy not found' }, { status: 404 })
    }

    // Calculate date range
    const now = new Date()
    let startDate = new Date()
    
    switch (range) {
      case '7d':
        startDate.setDate(now.getDate() - 7)
        break
      case '30d':
        startDate.setDate(now.getDate() - 30)
        break
      case '90d':
        startDate.setDate(now.getDate() - 90)
        break
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1)
        break
      default:
        startDate.setDate(now.getDate() - 30)
    }

    // Get wallet transactions (CREDIT, COMPLETED) for the vendor within date range
    const walletTransactions = await prisma.walletTransaction.findMany({
      where: {
        userId: session.id, // Vendor's userId
        type: "CREDIT",
        status: "COMPLETED",
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: "asc" },
    })

    // Get order IDs from wallet transactions to verify payments
    const orderIds = walletTransactions
      .map((wt) => wt.orderId)
      .filter((id): id is string => id !== null && id !== undefined)

    // Verify payments are PAID
    const payments =
      orderIds.length > 0
        ? await prisma.payment.findMany({
            where: {
              orderId: { in: orderIds },
              status: "PAID",
            },
            select: {
              orderId: true,
            },
          })
        : []
    const verifiedOrderIds = new Set(payments.map((p) => p.orderId).filter((id): id is string => id !== null))

    // Verify orders belong to PHARMACY module and this vendor
    const orders =
      orderIds.length > 0
        ? await prisma.order.findMany({
            where: {
              id: { in: orderIds },
              module: "PHARMACY",
              OR: [{ vendorId: session.id }, { vendorId: pharmacy.id }, { pharmacyId: pharmacy.id }],
            },
            select: {
              id: true,
            },
          })
        : []
    const validOrderIds = new Set(orders.map((o) => o.id))

    // Filter verified transactions (with payment verified and valid PHARMACY orders)
    const verifiedTransactions = walletTransactions.filter((wt) => {
      if (!wt.orderId) {
        // Check metadata for module if no orderId
        const metadata = wt.metadata as any
        if (metadata && metadata.module === "PHARMACY") {
          return true
        }
        return false
      }
      return verifiedOrderIds.has(wt.orderId) && validOrderIds.has(wt.orderId)
    })

    // Transform to sales data format (using wallet transaction amounts)
    const salesData = verifiedTransactions.map((wt) => ({
      total: wt.amount,
      createdAt: wt.createdAt,
    }))

    // Group sales by day/week/month
    const groupedSales = groupSalesByPeriod(salesData, range)
    
    // Generate labels and data
    const labels = generateLabels(range)
    const data = labels.map(label => groupedSales[label] || 0)

    // Get top products
    const topProducts = await getTopProducts(session.id, pharmacy.id, startDate)

    // Get customer metrics
    const customerMetrics = await getCustomerMetrics(session.id, pharmacy.id, startDate)

    // Get order metrics (based on verified wallet transactions)
    const orderMetrics = await getOrderMetrics(session.id, pharmacy.id, startDate, verifiedTransactions)

    return NextResponse.json({
      salesData: {
        labels,
        datasets: [{ data }]
      },
      topProducts,
      customerMetrics,
      orderMetrics,
      timeRange: range
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function groupSalesByPeriod(salesData: any[], range: string) {
  const grouped: { [key: string]: number } = {}
  
  salesData.forEach(sale => {
    let key = ''
    const date = new Date(sale.createdAt)
    
    switch (range) {
      case '7d':
        key = date.toLocaleDateString('en-US', { weekday: 'short' })
        break
      case '30d':
        key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        break
      case '90d':
        key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        break
      case '1y':
        key = date.toLocaleDateString('en-US', { month: 'short' })
        break
    }
    
    grouped[key] = (grouped[key] || 0) + sale.total
  })
  
  return grouped
}

function generateLabels(range: string): string[] {
  const labels = []
  const now = new Date()
  
  switch (range) {
    case '7d':
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }))
      }
      break
    case '30d':
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
      }
      break
    case '90d':
      for (let i = 89; i >= 0; i -= 3) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
      }
      break
    case '1y':
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now)
        date.setMonth(date.getMonth() - i)
        labels.push(date.toLocaleDateString('en-US', { month: 'short' }))
      }
      break
  }
  
  return labels
}

async function getTopProducts(userId: string, pharmacyId: string, startDate: Date) {
  // Get order IDs from verified wallet transactions
  const walletTransactions = await prisma.walletTransaction.findMany({
    where: {
      userId: userId,
      type: "CREDIT",
      status: "COMPLETED",
      createdAt: { gte: startDate },
      orderId: { not: null },
    },
    select: {
      orderId: true,
    },
  })

  const validOrderIds = walletTransactions
    .map((wt) => wt.orderId)
    .filter((id): id is string => id !== null)

  // Verify payments
  const payments =
    validOrderIds.length > 0
      ? await prisma.payment.findMany({
          where: {
            orderId: { in: validOrderIds },
            status: "PAID",
          },
          select: {
            orderId: true,
          },
        })
      : []
  const paidOrderIds = new Set(payments.map((p) => p.orderId).filter((id): id is string => id !== null))

  // Get orders with order items
  const orders = await prisma.order.findMany({
    where: {
      OR: [{ vendorId: userId }, { vendorId: pharmacyId }, { pharmacyId: pharmacyId }],
      module: "PHARMACY",
      id: validOrderIds.length > 0 ? { in: Array.from(paidOrderIds) } : undefined,
      createdAt: { gte: startDate },
    },
    include: {
      orderItems: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  })

  // Aggregate products from order items
  const productMap = new Map<string, { id: string; name: string; sales: number; revenue: number }>()

  orders.forEach((order) => {
    order.orderItems.forEach((item) => {
      const productId = item.productId || "unknown"
      const productName = item.product?.name || item.productName || "Unknown Product"
      const quantity = item.quantity || 0
      const price = item.price || 0
      const revenue = quantity * price

      if (productMap.has(productId)) {
        const existing = productMap.get(productId)!
        existing.sales += quantity
        existing.revenue += revenue
      } else {
        productMap.set(productId, {
          id: productId,
          name: productName,
          sales: quantity,
          revenue: revenue,
        })
      }
    })
  })

  const products = Array.from(productMap.values())
  const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0)

  // Calculate percentages and sort by revenue
  const topProducts = products
    .map((p) => ({
      ...p,
      percentage: totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  return topProducts
}

async function getCustomerMetrics(userId: string, pharmacyId: string, startDate: Date) {
  // Get order IDs from verified wallet transactions
  const walletTransactions = await prisma.walletTransaction.findMany({
    where: {
      userId: userId,
      type: "CREDIT",
      status: "COMPLETED",
      createdAt: { gte: startDate },
      orderId: { not: null },
    },
    select: {
      orderId: true,
    },
  })

  const orderIds = walletTransactions
    .map((wt) => wt.orderId)
    .filter((id): id is string => id !== null)

  // Verify payments
  const payments =
    orderIds.length > 0
      ? await prisma.payment.findMany({
          where: {
            orderId: { in: orderIds },
            status: "PAID",
          },
          select: {
            orderId: true,
          },
        })
      : []
  const paidOrderIds = new Set(payments.map((p) => p.orderId).filter((id): id is string => id !== null))

  // Get orders with verified payments
  const orders =
    orderIds.length > 0
      ? await prisma.order.findMany({
          where: {
            OR: [{ vendorId: userId }, { vendorId: pharmacyId }, { pharmacyId: pharmacyId }],
            module: "PHARMACY",
            id: { in: Array.from(paidOrderIds) },
            createdAt: { gte: startDate },
          },
          select: {
            customerId: true,
            total: true,
          },
        })
      : []

  // Get unique customers
  const customerMap = new Map<string, { count: number; totalSpent: number }>()
  orders.forEach((order) => {
    if (order.customerId) {
      if (customerMap.has(order.customerId)) {
        const existing = customerMap.get(order.customerId)!
        existing.count += 1
        existing.totalSpent += order.total || 0
      } else {
        customerMap.set(order.customerId, {
          count: 1,
          totalSpent: order.total || 0,
        })
      }
    }
  })

  const totalCustomers = customerMap.size
  const repeatCustomers = Array.from(customerMap.values()).filter((c) => c.count > 1).length
  const newCustomers = totalCustomers - repeatCustomers
  const totalSpent = Array.from(customerMap.values()).reduce((sum, c) => sum + c.totalSpent, 0)
  const averageCustomerValue = totalCustomers > 0 ? totalSpent / totalCustomers : 0

  return {
    totalCustomers,
    repeatCustomers,
    newCustomers,
    averageCustomerValue,
  }
}

async function getOrderMetrics(
  userId: string,
  pharmacyId: string,
  startDate: Date,
  verifiedTransactions: any[]
) {
  // Get order IDs from verified wallet transactions
  const orderIds = verifiedTransactions
    .map((wt) => wt.orderId)
    .filter((id): id is string => id !== null)

  // Get orders for metrics
  const orders =
    orderIds.length > 0
      ? await prisma.order.findMany({
          where: {
            OR: [{ vendorId: userId }, { vendorId: pharmacyId }, { pharmacyId: pharmacyId }],
            module: "PHARMACY",
            id: { in: orderIds },
            createdAt: { gte: startDate },
          },
          select: {
            id: true,
            status: true,
            total: true,
          },
        })
      : []

  // Get all orders (including non-verified) for counts
  const [totalOrders, completedOrders, cancelledOrders] = await Promise.all([
    prisma.order.count({
      where: {
        OR: [{ vendorId: userId }, { vendorId: pharmacyId }, { pharmacyId: pharmacyId }],
        module: "PHARMACY",
        createdAt: { gte: startDate },
      },
    }),
    prisma.order.count({
      where: {
        OR: [{ vendorId: userId }, { vendorId: pharmacyId }, { pharmacyId: pharmacyId }],
        module: "PHARMACY",
        status: "DELIVERED",
        createdAt: { gte: startDate },
      },
    }),
    prisma.order.count({
      where: {
        OR: [{ vendorId: userId }, { vendorId: pharmacyId }, { pharmacyId: pharmacyId }],
        module: "PHARMACY",
        status: "CANCELLED",
        createdAt: { gte: startDate },
      },
    }),
  ])

  // Calculate revenue from verified wallet transactions
  const totalRevenue = verifiedTransactions.reduce((sum, wt) => sum + (wt.amount || 0), 0)
  const verifiedOrdersCount = verifiedTransactions.length

  return {
    totalOrders,
    completedOrders,
    cancelledOrders,
    averageOrderValue: verifiedOrdersCount > 0 ? totalRevenue / verifiedOrdersCount : 0,
  }
}
