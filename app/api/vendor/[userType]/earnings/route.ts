import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { roundMoney2 } from "@/lib/money-round"

export async function GET(
  request: NextRequest,
  { params }: { params: { userType: string } }
) {
  try {
    const session = await authenticateRequest(request)

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { userType } = params
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '30d'
     



    // Validate user type
    const validUserTypes = ['pharmacy', 'wholesaler', 'mechanic', 'vendor' , 'food', 'grocery', 'auto_parts']
    if (!validUserTypes.includes(userType)) {
      return NextResponse.json({ error: "Invalid user type" }, { status: 400 })
    }

    // Determine module based on user type
    const moduleMap: Record<string, string> = {
      pharmacy: "PHARMACY",
      wholesaler: "PHARMACY", // Wholesalers also use PHARMACY module
      mechanic: "MECHANIC",
      vendor: "VENDOR",
      food: "FOOD",
      grocery: "GROCERY",
      auto_parts: "AUTO_PARTS",
    }
    const module = moduleMap[userType] || "PHARMACY"

    // Get vendor profile to verify (different types based on userType)
    let vendorProfile: any = null
    if (userType === 'pharmacy') {
      vendorProfile = await prisma.pharmacy.findUnique({
        where: { userId: session.id },
      })
    } else if (userType === 'wholesaler') {
      vendorProfile = await prisma.wholesaler.findUnique({
        where: { userId: session.id },
      })
    } else if (userType === 'mechanic') {
      vendorProfile = await prisma.mechanicProfile.findUnique({
        where: { userId: session.id },
      })
    } else if (userType === 'vendor') {
      vendorProfile = await prisma.vendorProfile.findUnique({
        where: { userId: session.id },
      })
    } else if (userType === 'food') {
      vendorProfile = await prisma.restaurant.findUnique({
        where: { userId: session.id },
      })
    } else if (userType === 'grocery') {
      vendorProfile = await prisma.groceryStore.findUnique({
        where: { userId: session.id },
      })
    } else if (userType === 'auto_parts') {
      vendorProfile = await prisma.autoPartsStore.findUnique({
        where: { userId: session.id },
      })
    }

    if (!vendorProfile) {
      return NextResponse.json({ error: `${userType} profile not found` }, { status: 404 })
    }

    // Calculate date ranges
    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0)
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - today.getDay())
    startOfWeek.setHours(0, 0, 0, 0)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999)

    let periodStart: Date
    switch (period) {
      case '7d':
        periodStart = startOfWeek
        break
      case '30d':
        periodStart = startOfMonth
        break
      case '90d':
        periodStart = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
        periodStart.setHours(0, 0, 0, 0)
        break
      case '1y':
        periodStart = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
        break
      default:
        periodStart = startOfMonth
    }

    // Get wallet first to verify balance later
    const wallet = await prisma.wallet.findUnique({
      where: { userId: session.id },
    })

    // Get all wallet transactions for vendor (CREDIT type, both PENDING and COMPLETED status)
    const allWalletTransactions = await prisma.walletTransaction.findMany({
      where: {
        userId: session.id, // Vendor's userId
        type: "CREDIT",
        status: {
          in: ["PENDING", "COMPLETED"],
        },
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

    // Separate PENDING and COMPLETED transactions
    const pendingWalletTransactions = allWalletTransactions.filter((wt) => wt.status === "PENDING")
    const completedWalletTransactions = allWalletTransactions.filter((wt) => wt.status === "COMPLETED")

    // Get order IDs from COMPLETED wallet transactions to verify payments
    const orderIds = completedWalletTransactions
      .map((wt) => wt.orderId)
      .filter((id): id is string => id !== null && id !== undefined)

    // Verify payments are PAID from Payment table
    const payments = orderIds.length > 0
      ? await prisma.payment.findMany({
          where: {
            orderId: { in: orderIds },
            status: "PAID",
          },
          select: {
            orderId: true,
            status: true,
            amount: true,
          },
        })
      : []
    const verifiedOrderIds = new Set(payments.map((p) => p.orderId).filter((id): id is string => id !== null))

    // Build OR clause for orders based on user type
    const orderWhereClause: any = {
      id: orderIds.length > 0 ? { in: orderIds } : undefined,
      paymentStatus: "PAID", // Also verify order payment status
    }

    // Add vendor matching logic based on user type
    if (userType === 'mechanic') {
      // For mechanics, match by metadata.mechanicId instead of vendorId/pharmacyId
      orderWhereClause.metadata = {
        path: ['mechanicId'],
        equals: session.id,
      }
    } else {
      const orderOrConditions: any[] = [{ vendorId: session.id }]
      
      if (userType === 'pharmacy' && vendorProfile) {
        orderOrConditions.push({ pharmacyId: vendorProfile.id })
      } else if (userType === 'wholesaler' && vendorProfile) {
        orderOrConditions.push({ vendorId: vendorProfile.id })
      }

      if (orderOrConditions.length > 1) {
        orderWhereClause.OR = orderOrConditions
      } else {
        // If only one condition, merge it directly
        orderWhereClause.vendorId = session.id
      }
    }

    // Get orders to verify they belong to the vendor and correct module
    const orders = orderIds.length > 0
      ? await prisma.order.findMany({
          where: orderWhereClause,
          select: {
            id: true,
            total: true,
            createdAt: true,
            paymentStatus: true,
            module: true,
          },
        })
      : []
    const validOrderIds = new Set(orders.map((o) => o.id))
    

    // Get all order IDs (including pending orders) for pending transaction verification
    const allPendingOrderIds = pendingWalletTransactions
      .map((wt) => wt.orderId)
      .filter((id): id is string => id !== null && id !== undefined)

    // Get all orders (including pending payments) for pending transactions
    const pendingOrdersWhereClause: any = {
      id: allPendingOrderIds.length > 0 ? { in: allPendingOrderIds } : undefined,
    }

    // Add vendor matching logic for pending orders
    const pendingOrderOrConditions: any[] = [{ vendorId: session.id }]
    
    if (userType === 'pharmacy' && vendorProfile) {
      pendingOrderOrConditions.push({ pharmacyId: vendorProfile.id })
    } else if (userType === 'wholesaler' && vendorProfile) {
      pendingOrderOrConditions.push({ vendorId: vendorProfile.id })
    }

    if (pendingOrderOrConditions.length > 1) {
      pendingOrdersWhereClause.OR = pendingOrderOrConditions
    } else {
      pendingOrdersWhereClause.vendorId = session.id
    }

    // Get all orders for pending transactions (they may have PENDING payment status)
    const pendingOrders = allPendingOrderIds.length > 0
      ? await prisma.order.findMany({
          where: pendingOrdersWhereClause,
          select: {
            id: true,
            total: true,
            createdAt: true,
            paymentStatus: true,
            module: true,
          },
        })
      : []
    const validPendingOrderIds = new Set(pendingOrders.map((o) => o.id))

    // Filter COMPLETED wallet transactions: must be verified by BOTH Payment table AND belong to valid orders
    // A transaction is verified if:
    // 1. It has a Payment record with status PAID, AND
    // 2. The order belongs to this vendor and has correct module
    const verifiedCompletedTransactions = completedWalletTransactions.filter((wt) => {
      
      if (!wt.orderId) {
        // Check metadata for module if no orderId (e.g., manual credits)
        const metadata = wt.metadata as any
        if (metadata && metadata.module === module) {
          return true
        }
        return false
      }
      // Verify: Payment exists and is PAID, AND order belongs to vendor
      return verifiedOrderIds.has(wt.orderId) && validOrderIds.has(wt.orderId)
    })
    

    // Filter PENDING wallet transactions by module (for pending earnings calculation)
    // Pending transactions don't need payment verification - they're waiting to be completed
    const verifiedPendingTransactions = pendingWalletTransactions.filter((wt) => {
      if (!wt.orderId) {
        // Check metadata for module if no orderId
        const metadata = wt.metadata as any
        if (metadata && metadata.module === module) {
          // For mechanics, also verify mechanicId in wallet transaction metadata
          if (userType === 'mechanic') {
            return metadata.mechanicId === session.id
          }
          return true
        }
        return false
      }
      // Verify order belongs to vendor (pending transactions may have pending payments)
      return validPendingOrderIds.has(wt.orderId)
    })

    // Use verified completed transactions for total earnings calculations
    const verifiedTransactions = verifiedCompletedTransactions

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

    // Calculate PENDING earnings (amounts waiting to be completed)
    const totalPendingEarnings = calculateTotal(verifiedPendingTransactions)
    const todayPendingEarnings = calculateTotal(
      verifiedPendingTransactions.filter((wt) => new Date(wt.createdAt) >= startOfDay)
    )
    const weekPendingEarnings = calculateTotal(
      verifiedPendingTransactions.filter((wt) => new Date(wt.createdAt) >= startOfWeek)
    )
    const monthPendingEarnings = calculateTotal(
      verifiedPendingTransactions.filter((wt) => new Date(wt.createdAt) >= startOfMonth)
    )

    // Calculate COMPLETED earnings (total earnings from verified completed transactions)
    const totalEarnings = calculateTotal(verifiedCompletedTransactions)
    const todayEarnings = calculateTotal(todayTransactions)
    const weekEarnings = calculateTotal(weekTransactions)
    const monthEarnings = calculateTotal(monthTransactions)
    const lastMonthEarnings = calculateTotal(lastMonthTransactions)
    const periodTotal = calculateTotal(
      verifiedTransactions.filter((wt) => new Date(wt.createdAt) >= periodStart)
    )

    // Verify wallet balance matches sum of COMPLETED transactions
    // The wallet balance should equal the sum of all COMPLETED CREDIT transactions minus DEBIT transactions
    const calculatedWalletBalance = calculateTotal(verifiedCompletedTransactions)
    const walletBalance = wallet?.balance || 0
    
    // Note: wallet balance might differ if there are DEBIT transactions (withdrawals, etc.)
    // So we use wallet.balance for pendingPayouts (available balance) but verify with transactions
    
    // Pending payouts = available wallet balance (already includes all completed credits minus debits)
    const pendingPayouts = walletBalance

    // Get order count from verified orders
    const totalOrders = orders.length
    const periodOrdersCount = orders.filter(
      (order) => new Date(order.createdAt) >= periodStart
    ).length
    const totalRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0)
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

    // Get commission rate from CommissionSetting
    const commissionSetting = await prisma.commissionSetting.findUnique({
      where: {
        module_commissionType: {
          module: module === "MECHANIC" ? "AUTO_PARTS" : module as any,
          commissionType: "VENDOR_COMMISSION",
        },
        isActive: true,
      },
    })

    // Use commission rate from settings or default
    const commissionRate = commissionSetting?.rate || 15

    // Calculate commission from wallet transaction metadata or calculate from total revenue
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
    const averageCommissionRate = totalRevenue > 0 ? (totalCommission / totalRevenue) * 100 : commissionRate

    // Growth percentage (current period vs previous period of same length)
    let growthPercentage = 0
    let previousPeriodEarnings = 0

    // Calculate previous period earnings based on selected period
    if (period === '7d') {
      const previousWeekStart = new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000)
      const previousWeekEnd = new Date(startOfWeek.getTime() - 1)
      const previousWeekTransactions = verifiedTransactions.filter(
        (wt) =>
          new Date(wt.createdAt) >= previousWeekStart && new Date(wt.createdAt) <= previousWeekEnd
      )
      previousPeriodEarnings = calculateTotal(previousWeekTransactions)
      if (previousPeriodEarnings > 0) {
        growthPercentage = ((weekEarnings - previousPeriodEarnings) / previousPeriodEarnings) * 100
      } else if (weekEarnings > 0) {
        growthPercentage = 100 // Infinite growth from zero
      }
    } else if (period === '30d') {
      // Compare this month with last month
      previousPeriodEarnings = lastMonthEarnings
      if (previousPeriodEarnings > 0) {
        growthPercentage = ((monthEarnings - previousPeriodEarnings) / previousPeriodEarnings) * 100
      } else if (monthEarnings > 0) {
        growthPercentage = 100 // Infinite growth from zero
      }
    } else if (period === '90d') {
      // Compare last 90 days with previous 90 days
      const previous90DaysStart = new Date(periodStart.getTime() - 90 * 24 * 60 * 60 * 1000)
      const previous90DaysEnd = new Date(periodStart.getTime() - 1)
      const previous90DaysTransactions = verifiedTransactions.filter(
        (wt) =>
          new Date(wt.createdAt) >= previous90DaysStart && new Date(wt.createdAt) <= previous90DaysEnd
      )
      previousPeriodEarnings = calculateTotal(previous90DaysTransactions)
      if (previousPeriodEarnings > 0) {
        growthPercentage = ((periodTotal - previousPeriodEarnings) / previousPeriodEarnings) * 100
      } else if (periodTotal > 0) {
        growthPercentage = 100
      }
    } else if (period === '1y') {
      // Compare this year with last year
      const lastYearStart = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
      const lastYearEnd = new Date(periodStart.getTime() - 1)
      const lastYearTransactions = verifiedTransactions.filter(
        (wt) =>
          new Date(wt.createdAt) >= lastYearStart && new Date(wt.createdAt) <= lastYearEnd
      )
      previousPeriodEarnings = calculateTotal(lastYearTransactions)
      if (previousPeriodEarnings > 0) {
        growthPercentage = ((periodTotal - previousPeriodEarnings) / previousPeriodEarnings) * 100
      } else if (periodTotal > 0) {
        growthPercentage = 100
      }
    }

    // Chart data (daily settled net + daily pending credits for the period)
    const periodTransactions = verifiedTransactions.filter(
      (wt) => new Date(wt.createdAt) >= periodStart
    )
    const periodPendingTx = verifiedPendingTransactions.filter(
      (wt) => new Date(wt.createdAt) >= periodStart
    )
    const dailyEarningsMap = new Map<string, number>()
    periodTransactions.forEach((wt) => {
      const dateKey = new Date(wt.createdAt).toISOString().split('T')[0] // YYYY-MM-DD
      dailyEarningsMap.set(dateKey, (dailyEarningsMap.get(dateKey) || 0) + (wt.amount || 0))
    })
    const dailyPendingMap = new Map<string, number>()
    periodPendingTx.forEach((wt) => {
      const dateKey = new Date(wt.createdAt).toISOString().split('T')[0]
      dailyPendingMap.set(dateKey, (dailyPendingMap.get(dateKey) || 0) + (wt.amount || 0))
    })

    const chartLabels: string[] = []
    const chartDataPoints: number[] = []
    const chartPendingPoints: number[] = []
    let currentDate = new Date(periodStart)
    const chartEnd = new Date(today)
    chartEnd.setHours(23, 59, 59, 999)
    while (currentDate <= chartEnd) {
      const dateKey = currentDate.toISOString().split('T')[0]
      chartLabels.push(currentDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }))
      chartDataPoints.push(roundMoney2(dailyEarningsMap.get(dateKey) || 0))
      chartPendingPoints.push(roundMoney2(dailyPendingMap.get(dateKey) || 0))
      currentDate.setDate(currentDate.getDate() + 1)
    }

    const totalWithdrawnAgg = await prisma.vendorWithdrawal.aggregate({
      where: { vendorId: session.id, status: "COMPLETED" },
      _sum: { amount: true },
    })
    const totalWithdrawn = roundMoney2(totalWithdrawnAgg._sum.amount ?? 0)

    const [vcPendingSum, vcCalculatedSum, vcPaidSum] = await Promise.all([
      prisma.vendorCommission.aggregate({
        where: { vendorId: session.id, status: "PENDING" },
        _sum: { commissionAmount: true },
      }),
      prisma.vendorCommission.aggregate({
        where: { vendorId: session.id, status: "CALCULATED" },
        _sum: { commissionAmount: true },
      }),
      prisma.vendorCommission.aggregate({
        where: { vendorId: session.id, status: "PAID" },
        _sum: { commissionAmount: true },
      }),
    ])
    const vendorCommissionSummary = {
      pending: roundMoney2(
        (vcPendingSum._sum.commissionAmount ?? 0) + (vcCalculatedSum._sum.commissionAmount ?? 0),
      ),
      paid: roundMoney2(vcPaidSum._sum.commissionAmount ?? 0),
    }

    /** Lines tagged at checkout with kiloSaleSource (mystery box / special offer) for vendor reporting */
    let promotionalAttribution = {
      mysteryBoxLineCount: 0,
      mysteryBoxRevenue: 0,
      specialOfferLineCount: 0,
      specialOfferRevenue: 0,
    }
    try {
      const mod =
        userType === "food" ? "FOOD" : userType === "grocery" ? "GROCERY" : userType === "pharmacy" ? "PHARMACY" : null
      if (mod) {
        const periodEnd = new Date()
        periodEnd.setHours(23, 59, 59, 999)
        const tagged = await prisma.orderItem.findMany({
          where: {
            order: {
              vendorId: session.id,
              module: mod as any,
              createdAt: { gte: periodStart, lte: periodEnd },
            },
            OR: [
              { customizations: { path: ["kiloSaleSource"], equals: "MYSTERY_BOX" } },
              { customizations: { path: ["kiloSaleSource"], equals: "SPECIAL_OFFER" } },
            ],
          },
          select: { totalPrice: true, customizations: true },
        })
        for (const li of tagged) {
          const src = (li.customizations as any)?.kiloSaleSource
          const amt = li.totalPrice || 0
          if (src === "MYSTERY_BOX") {
            promotionalAttribution.mysteryBoxLineCount++
            promotionalAttribution.mysteryBoxRevenue += amt
          } else if (src === "SPECIAL_OFFER") {
            promotionalAttribution.specialOfferLineCount++
            promotionalAttribution.specialOfferRevenue += amt
          }
        }
      }
    } catch {
      // optional reporting
    }

    return NextResponse.json({
      totalEarnings: roundMoney2(totalEarnings), // Total from COMPLETED and verified transactions
      pendingEarnings: roundMoney2(totalPendingEarnings), // Total from PENDING transactions
      thisMonth: roundMoney2(monthEarnings),
      thisMonthPending: roundMoney2(monthPendingEarnings),
      lastMonth: roundMoney2(lastMonthEarnings),
      thisWeek: roundMoney2(weekEarnings),
      thisWeekPending: roundMoney2(weekPendingEarnings),
      today: roundMoney2(todayEarnings),
      todayPending: roundMoney2(todayPendingEarnings),
      pendingPayouts: roundMoney2(pendingPayouts), // Available wallet balance (verified from wallet model)
      walletBalance: roundMoney2(walletBalance), // Actual wallet balance
      calculatedBalance: roundMoney2(calculatedWalletBalance), // Sum of completed transactions (for verification)
      totalOrders,
      periodOrders: periodOrdersCount,
      averageOrderValue: roundMoney2(averageOrderValue),
      commissionRate: averageCommissionRate,
      platformFees: roundMoney2(totalCommission),
      periodTotal: roundMoney2(periodTotal),
      growthPercentage,
      totalWithdrawn,
      vendorCommissionSummary,
      lifetimeBreakdown: {
        netSettled: roundMoney2(totalEarnings),
        pendingWallet: roundMoney2(totalPendingEarnings),
        orderCountAllTime: totalOrders,
        orderCountPeriod: periodOrdersCount,
      },
      chartData: {
        labels: chartLabels,
        datasets: [
          { data: chartDataPoints, color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`, strokeWidth: 2 },
          { data: chartPendingPoints, color: (opacity = 1) => `rgba(245, 158, 11, ${opacity})`, strokeWidth: 2 },
        ],
        legend: ["Net settled (period)", "Pending credits (period)"],
      },
      promotionalAttribution,
    })
  } catch (error) {
    console.error("Error fetching vendor earnings:", error)
    return NextResponse.json(
      { error: "Failed to fetch vendor earnings" },
      { status: 500 }
    )
  }
}




