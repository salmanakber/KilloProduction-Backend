import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get pharmacy ID (to verify it exists, but we use userId for wallet transactions)
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: session.id }
    })

    if (!pharmacy) {
      return NextResponse.json({ error: 'Pharmacy not found' }, { status: 404 })
    }

    // Calculate date ranges
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    // Get all wallet transactions for vendor (CREDIT type, COMPLETED status)
    // Filter for PHARMACY module via metadata or orderId -> order.module
    const allWalletTransactions = await prisma.walletTransaction.findMany({
      where: {
        userId: session.id, // Vendor's userId
        type: "CREDIT",
        status: "COMPLETED",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    // Get order IDs from wallet transactions to verify payments
    const orderIds = allWalletTransactions
      .map((wt) => wt.orderId)
      .filter((id): id is string => id !== null && id !== undefined)

    // Get payments for these orders to verify
    const payments = orderIds.length > 0
      ? await prisma.payment.findMany({
          where: {
            orderId: { in: orderIds },
            status: "PAID",
          },
          select: {
            orderId: true,
            status: true,
          },
        })
      : []

    // Create a set of verified order IDs
    const verifiedOrderIds = new Set(payments.map((p) => p.orderId).filter((id): id is string => id !== null))

    // Get orders to check module (PHARMACY) and verify they belong to this vendor
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
              module: true,
              vendorId: true,
              pharmacyId: true,
            },
          })
        : []

    const validOrderIds = new Set(orders.map((o) => o.id))

    // Filter wallet transactions: must be verified by payment AND belong to PHARMACY orders
    const verifiedTransactions = allWalletTransactions.filter((wt) => {
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

    // Filter by date ranges
    const todayTransactions = verifiedTransactions.filter(
      (wt) => new Date(wt.createdAt) >= startOfDay
    )
    const weekTransactions = verifiedTransactions.filter(
      (wt) => new Date(wt.createdAt) >= startOfWeek
    )
    const monthTransactions = verifiedTransactions.filter(
      (wt) => new Date(wt.createdAt) >= startOfMonth
    )
    const lastMonthTransactions = verifiedTransactions.filter(
      (wt) =>
        new Date(wt.createdAt) >= startOfLastMonth &&
        new Date(wt.createdAt) <= endOfLastMonth
    )

    // Calculate earnings from wallet transactions
    const calculateTotal = (transactions: any[]) =>
      transactions.reduce((sum, t) => sum + (t.amount || 0), 0)

    const totalEarnings = calculateTotal(verifiedTransactions)
    const today = calculateTotal(todayTransactions)
    const thisWeek = calculateTotal(weekTransactions)
    const thisMonth = calculateTotal(monthTransactions)
    const lastMonthEarnings = calculateTotal(lastMonthTransactions)

    // Get unique order IDs for count
    const uniqueOrderIds = new Set(
      verifiedTransactions.map((wt) => wt.orderId).filter((id): id is string => id !== null)
    )

    // Get order count and average order value from orders
    const [totalOrders, ordersWithTotals] = await Promise.all([
      prisma.order.count({
        where: {
          OR: [{ vendorId: session.id }, { vendorId: pharmacy.id }, { pharmacyId: pharmacy.id }],
          module: "PHARMACY",
          id: orderIds.length > 0 ? { in: Array.from(validOrderIds) } : undefined,
        },
      }),
      prisma.order.findMany({
        where: {
          OR: [{ vendorId: session.id }, { vendorId: pharmacy.id }, { pharmacyId: pharmacy.id }],
          module: "PHARMACY",
          id: orderIds.length > 0 ? { in: Array.from(validOrderIds) } : undefined,
          paymentStatus: "PAID",
        },
        select: {
          total: true,
        },
      }),
    ])

    const totalRevenue = ordersWithTotals.reduce((sum, order) => sum + (order.total || 0), 0)
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

    // Get pending payouts from wallet balance (completed but not withdrawn)
    const wallet = await prisma.wallet.findUnique({
      where: { userId: session.id },
    })
    const pendingPayouts = wallet?.balance || 0

    // Get commission rate from CommissionSetting
    const commissionSetting = await prisma.commissionSetting.findUnique({
      where: {
        module_commissionType: {
          module: "PHARMACY",
          commissionType: "VENDOR_COMMISSION",
        },
        isActive: true,
      },
    })

    // Use commission rate from settings or default
    const commissionRate = commissionSetting?.rate || 15

    // Calculate commission from wallet transaction metadata
    let totalCommission = 0
    verifiedTransactions.forEach((wt) => {
      const metadata = wt.metadata as any
      if (metadata && metadata.vendorCommission) {
        totalCommission += metadata.vendorCommission || 0
      }
    })

    // If no commission found in metadata, calculate using commission rate from settings
    if (totalCommission === 0 && totalRevenue > 0) {
      totalCommission = (totalRevenue * commissionRate) / 100
    }

    return NextResponse.json({
      totalEarnings,
      thisMonth,
      lastMonth: lastMonthEarnings,
      thisWeek,
      today,
      pendingPayouts,
      totalOrders,
      averageOrderValue: avgOrderValue,
      commissionRate,
      platformFees: totalCommission,
    })
  } catch (error) {
    console.error('Error fetching earnings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
