import { Module, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

const ALLOWED_RANGE = new Set(["7d", "30d", "90d", "1y", "weekly", "monthly", "yearly"])

export type ReportFilters = {
  range: string
  module: "ALL" | Module
  startDate: Date
  endDate: Date
  orderId?: string
  customerId?: string
  vendorId?: string
  riderId?: string
  includeLogs: boolean
  logLimit: number
}

export function parseReportFilters(searchParams: URLSearchParams): ReportFilters {
  const rangeRaw = (searchParams.get("range") || "30d").toLowerCase()
  const range = ALLOWED_RANGE.has(rangeRaw) ? rangeRaw : "30d"

  const parsedStart = searchParams.get("startDate")
  const parsedEnd = searchParams.get("endDate")
  const hasCustomRange = Boolean(parsedStart && parsedEnd)

  let startDate = new Date()
  let endDate = new Date()

  if (hasCustomRange) {
    startDate = new Date(parsedStart as string)
    endDate = new Date(parsedEnd as string)
  } else {
    if (range === "7d" || range === "weekly") startDate.setDate(startDate.getDate() - 7)
    else if (range === "90d") startDate.setDate(startDate.getDate() - 90)
    else if (range === "1y" || range === "yearly") startDate.setFullYear(startDate.getFullYear() - 1)
    else if (range === "monthly") startDate.setMonth(startDate.getMonth() - 1)
    else startDate.setDate(startDate.getDate() - 30)
  }

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Invalid startDate/endDate. Expected ISO date strings.")
  }
  if (startDate > endDate) {
    throw new Error("startDate must be earlier than or equal to endDate.")
  }

  const moduleRaw = (searchParams.get("module") || "ALL").toUpperCase()
  const module = moduleRaw === "ALL" ? "ALL" : Module[moduleRaw as keyof typeof Module]
  if (!module) {
    throw new Error(`Invalid module '${moduleRaw}'.`)
  }

  const includeLogs = (searchParams.get("includeLogs") || "true").toLowerCase() !== "false"
  const requestedLimit = Number(searchParams.get("logLimit") || "100")
  const logLimit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(300, requestedLimit)) : 100

  return {
    range,
    module,
    startDate,
    endDate,
    orderId: searchParams.get("orderId") || undefined,
    customerId: searchParams.get("customerId") || undefined,
    vendorId: searchParams.get("vendorId") || undefined,
    riderId: searchParams.get("riderId") || undefined,
    includeLogs,
    logLimit,
  }
}

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  return Number(value || 0)
}

function readLoyaltyDiscountFromMetadata(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return 0
  const loyalty = (metadata as Record<string, unknown>).loyalty
  if (!loyalty || typeof loyalty !== "object" || Array.isArray(loyalty)) return 0
  const discountAmount = (loyalty as Record<string, unknown>).discountAmount
  return Number.isFinite(Number(discountAmount)) ? Number(discountAmount) : 0
}

function buildOrderWhere(filters: ReportFilters): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    createdAt: { gte: filters.startDate, lte: filters.endDate },
  }

  if (filters.module !== "ALL") where.module = filters.module
  if (filters.orderId) where.OR = [{ id: filters.orderId }, { orderNumber: filters.orderId }]
  if (filters.customerId) where.customerId = filters.customerId
  if (filters.vendorId) where.vendorId = filters.vendorId
  if (filters.riderId) where.riderId = filters.riderId

  return where
}

function chunkByDay(date: Date) {
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function chunkByMonth(date: Date) {
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${yyyy}-${mm}`
}

export async function buildReportData(filters: ReportFilters) {
  const orderWhere = buildOrderWhere(filters)
  const deliveredWhere: Prisma.OrderWhereInput = { ...orderWhere, status: "DELIVERED" }

  const [orders, totalOrders, totalUsers, usersByRole, ordersByStatus, moduleFinancials] = await prisma.$transaction([
    prisma.order.findMany({
      where: orderWhere,
      select: {
        id: true,
        orderNumber: true,
        childId: true,
        isChildOrder: true,
        module: true,
        status: true,
        paymentStatus: true,
        customerId: true,
        vendorId: true,
        riderId: true,
        subtotal: true,
        tax: true,
        deliveryFee: true,
        serviceFee: true,
        discount: true,
        total: true,
        vendorCommission: true,
        riderCommission: true,
        platformCommission: true,
        metadata: true,
        createdAt: true,
        customer: { select: { id: true, name: true, email: true } },
        vendor: { select: { id: true, name: true, email: true } },
        rider: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.count({ where: orderWhere }),
    prisma.user.count({ where: { createdAt: { gte: filters.startDate, lte: filters.endDate } } }),
    prisma.user.groupBy({
      by: ["role"],
      orderBy: { role: "asc" },
      where: { createdAt: { gte: filters.startDate, lte: filters.endDate } },
      _count: true,
    }),
    prisma.order.groupBy({ by: ["status"], orderBy: { status: "asc" }, where: orderWhere, _count: true }),
    prisma.order.groupBy({
      by: ["module"],
      orderBy: { module: "asc" },
      where: orderWhere,
      _sum: { total: true, discount: true, platformCommission: true, vendorCommission: true, riderCommission: true },
      _count: true,
    }),
  ])

  const orderIds = orders.map((o) => o.id)
  const orderToGroupKey = new Map<string, string>()
  const groupedOrders = new Map<string, typeof orders>()
  for (const order of orders) {
    const key = order.isChildOrder && order.childId ? order.childId : order.id
    orderToGroupKey.set(order.id, key)
    const bucket = groupedOrders.get(key) || []
    bucket.push(order)
    groupedOrders.set(key, bucket)
  }

  const effectiveOrders = Array.from(groupedOrders.entries()).map(([groupId, rows]) => {
    const parent = rows.find((row) => row.id === groupId) || rows[0]
    const subtotal = rows.reduce((sum, row) => sum + toNumber(row.subtotal), 0)
    const deliveryFee = rows.reduce((sum, row) => sum + toNumber(row.deliveryFee), 0)
    const serviceFee = rows.reduce((sum, row) => sum + toNumber(row.serviceFee), 0)
    const tax = rows.reduce((sum, row) => sum + toNumber(row.tax), 0)
    const discount = rows.reduce((sum, row) => sum + toNumber(row.discount), 0)
    const total = rows.reduce((sum, row) => sum + toNumber(row.total), 0)
    const platformCommission = rows.reduce((sum, row) => sum + toNumber(row.platformCommission), 0)
    const vendorCommission = rows.reduce((sum, row) => sum + toNumber(row.vendorCommission), 0)
    const riderCommission = rows.reduce((sum, row) => sum + toNumber(row.riderCommission), 0)

    const uniqueVendors = new Set(rows.map((row) => row.vendor?.id).filter(Boolean))
    const vendor = uniqueVendors.size > 1 ? { id: null, name: "Multiple Vendors", email: null } : parent.vendor

    return {
      ...parent,
      id: groupId,
      orderNumber: parent.orderNumber || groupId,
      subtotal,
      deliveryFee,
      serviceFee,
      tax,
      discount,
      total,
      platformCommission,
      vendorCommission,
      riderCommission,
      vendor: vendor as any,
    }
  })
  const customerIds = Array.from(new Set(orders.map((o) => o.customerId)))
  const whereOrderScope = orderIds.length ? { in: orderIds } : undefined
  const whereCustomerScope = customerIds.length ? { in: customerIds } : undefined

  const [
    vendorCommissionAgg,
    riderCommissionAgg,
    paymentAgg,
    processingAgg,
    promoAgg,
    couponAgg,
    loyaltyRedeemedAgg,
    specialOfferAgg,
    walletAgg,
    transactionAgg,
    vendorRevenueAgg,
    riderRevenueAgg,
    customerTaxAgg,
  ] = await prisma.$transaction([
    prisma.vendorCommission.aggregate({
      where: {
        createdAt: { gte: filters.startDate, lte: filters.endDate },
        ...(filters.module !== "ALL" ? { module: filters.module } : {}),
        ...(whereOrderScope ? { orderId: whereOrderScope } : {}),
        ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
      },
      _sum: { commissionAmount: true, orderAmount: true },
      _count: true,
    }),
    prisma.riderCommission.aggregate({
      where: {
        createdAt: { gte: filters.startDate, lte: filters.endDate },
        ...(filters.module !== "ALL" ? { module: filters.module } : {}),
        ...(whereOrderScope ? { orderId: whereOrderScope } : {}),
        ...(filters.riderId ? { riderId: filters.riderId } : {}),
      },
      _sum: { commissionAmount: true, orderAmount: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: {
        createdAt: { gte: filters.startDate, lte: filters.endDate },
        status: "PAID",
        ...(whereOrderScope ? { orderId: whereOrderScope } : {}),
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.paymentProcessingLedger.aggregate({
      where: {
        createdAt: { gte: filters.startDate, lte: filters.endDate },
        ...(filters.module !== "ALL" ? { module: filters.module } : {}),
      },
      _sum: { commissionAmount: true, orderAmount: true },
      _count: true,
    }),
    prisma.promoCodeUsage.aggregate({
      where: {
        createdAt: { gte: filters.startDate, lte: filters.endDate },
        ...(whereOrderScope ? { orderId: whereOrderScope } : {}),
        ...(whereCustomerScope ? { userId: whereCustomerScope } : {}),
      },
      _sum: { discount: true },
      _count: true,
    }),
    prisma.couponUsage.aggregate({
      where: {
        usedAt: { gte: filters.startDate, lte: filters.endDate },
        ...(whereOrderScope ? { orderId: whereOrderScope } : {}),
        ...(whereCustomerScope ? { userId: whereCustomerScope } : {}),
      },
      _sum: { discountAmount: true },
      _count: true,
    }),
    prisma.loyaltyTransaction.aggregate({
      where: {
        createdAt: { gte: filters.startDate, lte: filters.endDate },
        type: "REDEEMED",
        ...(whereOrderScope ? { orderId: whereOrderScope } : {}),
        ...(whereCustomerScope ? { userId: whereCustomerScope } : {}),
      },
      _sum: { points: true },
      _count: true,
    }),
    prisma.specialOfferReport.aggregate({
      where: {
        createdAt: { gte: filters.startDate, lte: filters.endDate },
      },
      _sum: { discountPlatform: true, discountVendor: true },
      _count: true,
    }),
    prisma.walletTransaction.aggregate({
      where: {
        createdAt: { gte: filters.startDate, lte: filters.endDate },
        ...(whereOrderScope ? { orderId: whereOrderScope } : {}),
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: {
        createdAt: { gte: filters.startDate, lte: filters.endDate },
        ...(whereOrderScope ? { orderId: whereOrderScope } : {}),
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { ...deliveredWhere, ...(filters.vendorId ? { vendorId: filters.vendorId } : {}) },
      _sum: { total: true, discount: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { ...deliveredWhere, ...(filters.riderId ? { riderId: filters.riderId } : {}) },
      _sum: { total: true, discount: true },
      _count: true,
    }),
    prisma.customerTax.aggregate({
      where: {
        createdAt: { gte: filters.startDate, lte: filters.endDate },
        ...(filters.module !== "ALL" ? { module: filters.module } : {}),
        ...(whereOrderScope ? { orderId: whereOrderScope } : {}),
      },
      _sum: { taxAmount: true },
      _count: true,
    }),
  ])

  const [payments, processingRows, vendorCommissionRows, riderEarningRows, loyaltyRows] = await prisma.$transaction([
    prisma.payment.findMany({
      where: {
        createdAt: { gte: filters.startDate, lte: filters.endDate },
        ...(whereOrderScope ? { orderId: whereOrderScope } : {}),
      },
      select: { id: true, orderId: true, amount: true, metadata: true, status: true, gateway: true },
    }),
    prisma.paymentProcessingLedger.findMany({
      where: {
        createdAt: { gte: filters.startDate, lte: filters.endDate },
        ...(filters.module !== "ALL" ? { module: filters.module } : {}),
      },
      select: { paymentId: true, commissionAmount: true },
    }),
    prisma.vendorCommission.findMany({
      where: {
        createdAt: { gte: filters.startDate, lte: filters.endDate },
        ...(whereOrderScope ? { orderId: whereOrderScope } : {}),
        ...(filters.module !== "ALL" ? { module: filters.module } : {}),
      },
      select: {
        orderId: true,
        module: true,
        commissionType: true,
        commissionAmount: true,
      },
    }),
    prisma.riderEarning.findMany({
      where: {
        createdAt: { gte: filters.startDate, lte: filters.endDate },
        ...(whereOrderScope ? { orderId: whereOrderScope } : {}),
        ...(filters.riderId ? { riderId: filters.riderId } : {}),
      },
      select: {
        orderId: true,
        amount: true,
        commission: true,
        netAmount: true,
      },
    }),
    prisma.loyaltyTransaction.findMany({
      where: {
        createdAt: { gte: filters.startDate, lte: filters.endDate },
        type: "REDEEMED",
        ...(whereOrderScope ? { orderId: whereOrderScope } : {}),
        ...(whereCustomerScope ? { userId: whereCustomerScope } : {}),
      },
      select: {
        orderId: true,
        points: true,
      },
    }),
  ])

  const dailyBuckets = new Map<string, { date: string; grossSales: number; orders: number; platformIntake: number }>()
  const monthlyBuckets = new Map<string, { month: string; grossSales: number; orders: number; platformIntake: number }>()
  for (const order of effectiveOrders) {
    const day = chunkByDay(order.createdAt)
    const month = chunkByMonth(order.createdAt)
    const intake = toNumber(order.platformCommission) + toNumber(order.vendorCommission) + toNumber(order.riderCommission)
    const amount = toNumber(order.total)

    const dayBucket = dailyBuckets.get(day) || { date: day, grossSales: 0, orders: 0, platformIntake: 0 }
    dayBucket.grossSales += amount
    dayBucket.orders += 1
    dayBucket.platformIntake += intake
    dailyBuckets.set(day, dayBucket)

    const monthBucket = monthlyBuckets.get(month) || { month, grossSales: 0, orders: 0, platformIntake: 0 }
    monthBucket.grossSales += amount
    monthBucket.orders += 1
    monthBucket.platformIntake += intake
    monthlyBuckets.set(month, monthBucket)
  }

  const loyaltyDiscountFromOrderMeta = effectiveOrders.reduce((sum, row) => {
    const groupedRows = groupedOrders.get(row.id) || [row]
    return sum + groupedRows.reduce((inner, item) => inner + readLoyaltyDiscountFromMetadata(item.metadata as Prisma.JsonValue | null | undefined), 0)
  }, 0)
  const grossSales = effectiveOrders.filter((o) => o.status === "DELIVERED").reduce((acc, o) => acc + toNumber(o.total), 0)
  const systemCommission = toNumber(vendorCommissionAgg._sum.commissionAmount) + toNumber(riderCommissionAgg._sum.commissionAmount)
  const riderCommission = toNumber(riderCommissionAgg._sum.commissionAmount)
  const paymentProcessingFees = toNumber(processingAgg._sum.commissionAmount)
  const promoDiscount = toNumber(promoAgg._sum.discount)
  const loyaltyDiscount = loyaltyDiscountFromOrderMeta
  const specialOfferDiscount =
    toNumber(specialOfferAgg._sum?.discountPlatform) + toNumber(specialOfferAgg._sum?.discountVendor)
  const couponDiscount = toNumber(couponAgg._sum.discountAmount)
  const totalDiscount = promoDiscount + loyaltyDiscount + specialOfferDiscount + couponDiscount
  const netProfitOrLoss = systemCommission - paymentProcessingFees - totalDiscount

  const moduleAccumulator = new Map<string, { orders: number; grossSales: number; totalDiscount: number; platformCommission: number; vendorCommission: number; riderCommission: number }>()
  for (const row of effectiveOrders) {
    const key = String(row.module)
    const bucket = moduleAccumulator.get(key) || { orders: 0, grossSales: 0, totalDiscount: 0, platformCommission: 0, vendorCommission: 0, riderCommission: 0 }
    bucket.orders += 1
    bucket.grossSales += toNumber(row.total)
    bucket.totalDiscount += toNumber(row.discount)
    bucket.platformCommission += toNumber(row.platformCommission)
    bucket.vendorCommission += toNumber(row.vendorCommission)
    bucket.riderCommission += toNumber(row.riderCommission)
    moduleAccumulator.set(key, bucket)
  }
  const moduleMetrics = Array.from(moduleAccumulator.entries()).map(([module, m]) => {
    const commissionIntake = m.platformCommission + m.vendorCommission + m.riderCommission
    return {
      module,
      orders: m.orders,
      grossSales: m.grossSales,
      totalDiscount: m.totalDiscount,
      platformCommission: m.platformCommission,
      vendorCommission: m.vendorCommission,
      riderCommission: m.riderCommission,
      systemIntake: commissionIntake,
      netProfitOrLoss: commissionIntake - m.totalDiscount,
    }
  })

  const autoparts = await prisma.$transaction([
    prisma.order.aggregate({
      where: {
        ...orderWhere,
        module: "AUTO_PARTS",
      },
      _sum: { total: true, discount: true, platformCommission: true },
      _count: true,
    }),
    prisma.autoPartsStore.count({ where: { createdAt: { gte: filters.startDate, lte: filters.endDate } } }),
    prisma.autoPart.count({ where: { createdAt: { gte: filters.startDate, lte: filters.endDate } } }),
    prisma.partRequest.count({ where: { createdAt: { gte: filters.startDate, lte: filters.endDate } } }),
    prisma.partOffer.count({ where: { createdAt: { gte: filters.startDate, lte: filters.endDate } } }),
  ])

  const [autoPartOrderAgg, autoPartStoreCount, autoPartCount, partRequestCount, partOfferCount] = autoparts

  const logs = filters.includeLogs
    ? await prisma.$transaction([
        prisma.payment.findMany({
          where: { createdAt: { gte: filters.startDate, lte: filters.endDate }, ...(whereOrderScope ? { orderId: whereOrderScope } : {}) },
          select: { id: true, orderId: true, amount: true, status: true, gateway: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: filters.logLimit,
        }),
        prisma.vendorCommission.findMany({
          where: {
            createdAt: { gte: filters.startDate, lte: filters.endDate },
            ...(filters.module !== "ALL" ? { module: filters.module } : {}),
            ...(whereOrderScope ? { orderId: whereOrderScope } : {}),
          },
          select: { id: true, orderId: true, vendorId: true, commissionAmount: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: filters.logLimit,
        }),
        prisma.riderCommission.findMany({
          where: {
            createdAt: { gte: filters.startDate, lte: filters.endDate },
            ...(filters.module !== "ALL" ? { module: filters.module } : {}),
            ...(whereOrderScope ? { orderId: whereOrderScope } : {}),
          },
          select: { id: true, orderId: true, riderId: true, commissionAmount: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: filters.logLimit,
        }),
        prisma.walletTransaction.findMany({
          where: { createdAt: { gte: filters.startDate, lte: filters.endDate }, ...(whereOrderScope ? { orderId: whereOrderScope } : {}) },
          select: { id: true, orderId: true, userId: true, amount: true, type: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: filters.logLimit,
        }),
      ])
    : [[], [], [], []]

  const [paymentLogs, vendorCommissionLogs, riderCommissionLogs, walletLogs] = logs

  const processingByPaymentId = new Map<string, number>()
  for (const row of processingRows) {
    processingByPaymentId.set(row.paymentId, (processingByPaymentId.get(row.paymentId) || 0) + toNumber(row.commissionAmount))
  }
  const processingByOrderId = new Map<string, number>()
  for (const payment of payments) {
    if (!payment.orderId) continue
    const groupedOrderId = orderToGroupKey.get(payment.orderId) || payment.orderId
    const meta = (payment.metadata || {}) as Record<string, unknown>
    const metaFee = toNumber(meta.paymentProcessingFee as number | null | undefined)
    const ledgerFee = payment.id ? processingByPaymentId.get(payment.id) || 0 : 0
    const fee = Math.max(metaFee, ledgerFee, 0)
    processingByOrderId.set(groupedOrderId, (processingByOrderId.get(groupedOrderId) || 0) + fee)
  }

  const platformCommissionByOrderId = new Map<string, number>()
  const vendorCommissionByOrderId = new Map<string, number>()
  for (const row of vendorCommissionRows) {
    if (!row.orderId) continue
    const groupedOrderId = orderToGroupKey.get(row.orderId) || row.orderId
    const nextAmount = toNumber(row.commissionAmount)
    if (row.commissionType === "PLATFORM_FEE") {
      platformCommissionByOrderId.set(groupedOrderId, (platformCommissionByOrderId.get(groupedOrderId) || 0) + nextAmount)
    }
    if (row.commissionType === "VENDOR_COMMISSION") {
      vendorCommissionByOrderId.set(groupedOrderId, (vendorCommissionByOrderId.get(groupedOrderId) || 0) + nextAmount)
    }
  }

  const riderGrossByOrderId = new Map<string, number>()
  const riderCommissionByOrderId = new Map<string, number>()
  const riderNetByOrderId = new Map<string, number>()
  for (const row of riderEarningRows) {
    if (!row.orderId) continue
    const groupedOrderId = orderToGroupKey.get(row.orderId) || row.orderId
    riderGrossByOrderId.set(groupedOrderId, (riderGrossByOrderId.get(groupedOrderId) || 0) + toNumber(row.amount))
    riderCommissionByOrderId.set(groupedOrderId, (riderCommissionByOrderId.get(groupedOrderId) || 0) + toNumber(row.commission))
    riderNetByOrderId.set(groupedOrderId, (riderNetByOrderId.get(groupedOrderId) || 0) + toNumber(row.netAmount))
  }

  const loyaltyByOrderId = new Map<string, number>()
  for (const row of loyaltyRows) {
    if (!row.orderId) continue
    const groupedOrderId = orderToGroupKey.get(row.orderId) || row.orderId
    loyaltyByOrderId.set(groupedOrderId, (loyaltyByOrderId.get(groupedOrderId) || 0) + toNumber(row.points))
  }

  const loyaltyDiscountMetaByOrderId = new Map<string, number>()
  for (const [groupedOrderId, rows] of Array.from(groupedOrders.entries())) {
    const loyaltyDiscount = rows.reduce((sum, row) => {
      return sum + readLoyaltyDiscountFromMetadata(row.metadata as Prisma.JsonValue | null | undefined)
    }, 0)
    loyaltyDiscountMetaByOrderId.set(groupedOrderId, loyaltyDiscount)
  }

  const orderBreakdown = effectiveOrders.map((o) => {
    const platformCommission = platformCommissionByOrderId.get(o.id) ?? toNumber(o.platformCommission)
    const vendorCut = vendorCommissionByOrderId.get(o.id) ?? toNumber(o.vendorCommission)
    const riderCut = riderCommissionByOrderId.get(o.id) ?? toNumber(o.riderCommission)
    const riderNet = riderNetByOrderId.get(o.id) || 0
    const riderGross = riderGrossByOrderId.get(o.id) || toNumber(o.deliveryFee)
    const loyaltyDiscount = loyaltyDiscountMetaByOrderId.get(o.id) || 0
    const loyaltyPointsUsed = loyaltyByOrderId.get(o.id) || 0
    const totalDiscount = toNumber(o.discount) + loyaltyDiscount
    const systemCut = platformCommission + vendorCut + riderCut
    const processingFee = processingByOrderId.get(o.id) || 0
    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      module: o.module,
      status: o.status,
      paymentStatus: o.paymentStatus,
      customer: o.customer,
      vendor: o.vendor,
      rider: o.rider,
      subtotal: toNumber(o.subtotal),
      tax: toNumber(o.tax),
      serviceFee: toNumber(o.serviceFee),
      deliveryFee: toNumber(o.deliveryFee),
      discount: totalDiscount,
      loyaltyDiscount,
      loyaltyPointsUsed,
      grossSales: toNumber(o.total),
      customerPaidTotal: toNumber(o.subtotal) + toNumber(o.deliveryFee) + toNumber(o.serviceFee) + toNumber(o.tax) - toNumber(o.discount),
      paymentProcessingFee: processingFee,
      riderEarning: {
        gross: riderGross,
        commission: riderCut,
        net: riderNet,
      },
      commissions: {
        platformCommission,
        vendorCommission: vendorCut,
        riderCommission: riderCut,
        totalSystemIntake: systemCut,
      },
      netProfitOrLoss: systemCut - totalDiscount - processingFee,
      createdAt: o.createdAt,
    }
  })

  return {
    filters: {
      range: filters.range,
      module: filters.module,
      orderId: filters.orderId || null,
      customerId: filters.customerId || null,
      vendorId: filters.vendorId || null,
      riderId: filters.riderId || null,
      startDate: filters.startDate,
      endDate: filters.endDate,
    },
    summary: {
      totalOrders: effectiveOrders.length,
      totalUsers,
      grossSales,
      systemCommission,
      riderCommission,
      vendorCommission: toNumber(vendorCommissionAgg._sum.commissionAmount),
      customerTaxCollected: toNumber(customerTaxAgg._sum.taxAmount),
      paymentProcessingFees,
      totalDiscount,
      netProfitOrLoss,
    },
    discounts: {
      promoCode: promoDiscount,
      loyaltyPoints: loyaltyDiscount,
      couponDiscount,
      specialOffers: specialOfferDiscount,
      totalDiscount,
      impactOnProfit: totalDiscount,
    },
    entityInsights: {
      customer: {
        customerId: filters.customerId || null,
        totalOrders: filters.customerId ? orders.length : null,
        totalDiscountGiven: filters.customerId ? totalDiscount : null,
      },
      vendor: {
        vendorId: filters.vendorId || null,
        totalDeliveredOrders: vendorRevenueAgg._count,
        grossSales: toNumber(vendorRevenueAgg._sum.total),
        totalDiscount: toNumber(vendorRevenueAgg._sum.discount),
        systemCommissionEarned: toNumber(vendorCommissionAgg._sum.commissionAmount),
      },
      rider: {
        riderId: filters.riderId || null,
        totalDeliveredOrders: riderRevenueAgg._count,
        grossSales: toNumber(riderRevenueAgg._sum.total),
        totalDiscount: toNumber(riderRevenueAgg._sum.discount),
        systemCommissionEarned: toNumber(riderCommissionAgg._sum.commissionAmount),
      },
    },
    breakdown: {
      ordersByStatus,
      usersByRole,
      moduleMetrics,
      autoParts: {
        totalOrders: autoPartOrderAgg._count,
        grossSales: toNumber(autoPartOrderAgg._sum.total),
        totalDiscount: toNumber(autoPartOrderAgg._sum.discount),
        platformCommission: toNumber(autoPartOrderAgg._sum.platformCommission),
        storesCreated: autoPartStoreCount,
        partsCreated: autoPartCount,
        partRequests: partRequestCount,
        partOffers: partOfferCount,
      },
    },
    trends: {
      daily: Array.from(dailyBuckets.values()),
      monthly: Array.from(monthlyBuckets.values()),
    },
    financials: {
      vendorCommission: {
        entries: vendorCommissionAgg._count,
        orderAmount: toNumber(vendorCommissionAgg._sum.orderAmount),
        totalCommission: toNumber(vendorCommissionAgg._sum.commissionAmount),
      },
      riderCommission: {
        entries: riderCommissionAgg._count,
        orderAmount: toNumber(riderCommissionAgg._sum.orderAmount),
        totalCommission: toNumber(riderCommissionAgg._sum.commissionAmount),
      },
      payments: { entries: paymentAgg._count, totalPaid: toNumber(paymentAgg._sum.amount) },
      paymentProcessing: {
        entries: processingAgg._count,
        orderAmount: toNumber(processingAgg._sum.orderAmount),
        totalFees: paymentProcessingFees,
      },
      walletTransactions: { entries: walletAgg._count, totalAmount: toNumber(walletAgg._sum.amount) },
      transactions: { entries: transactionAgg._count, totalAmount: toNumber(transactionAgg._sum.amount) },
    },
    drilldown: {
      orders: orderBreakdown,
    },
    logs: {
      payments: paymentLogs,
      vendorCommissions: vendorCommissionLogs,
      riderCommissions: riderCommissionLogs,
      walletTransactions: walletLogs,
    },
  }
}

function escapeCsv(value: unknown) {
  if (value === null || value === undefined) return ""
  const raw = String(value)
  if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
    return `"${raw.replaceAll('"', '""')}"`
  }
  return raw
}

export function buildCsvExport(reportData: Awaited<ReturnType<typeof buildReportData>>) {
  const lines: string[] = []
  lines.push("section,key,value")

  for (const [key, value] of Object.entries(reportData.summary)) {
    lines.push([escapeCsv("summary"), escapeCsv(key), escapeCsv(value)].join(","))
  }
  for (const [key, value] of Object.entries(reportData.discounts)) {
    lines.push([escapeCsv("discounts"), escapeCsv(key), escapeCsv(value)].join(","))
  }
  for (const row of reportData.drilldown.orders) {
    lines.push(
      [
        "order",
        row.orderNumber,
        JSON.stringify({
          module: row.module,
          status: row.status,
          grossSales: row.grossSales,
          discount: row.discount,
          netProfitOrLoss: row.netProfitOrLoss,
        }),
      ]
        .map(escapeCsv)
        .join(","),
    )
  }

  return lines.join("\n")
}
