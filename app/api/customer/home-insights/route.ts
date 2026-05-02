import { NextRequest, NextResponse } from "next/server"
import { MoneyTransferStatus, OrderStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

/** Parent orders only; exclude non-completed from "spend" totals. */
const SPEND_EXCLUDED: OrderStatus[] = [
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
  OrderStatus.EXPIRED,
  OrderStatus.WITHDRAWN,
  OrderStatus.DRAFT,
]

const TERMINAL_FOR_ACTIVE: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
  OrderStatus.EXPIRED,
  OrderStatus.WITHDRAWN,
  OrderStatus.DRAFT,
]

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

const TRANSFER_PAID: MoneyTransferStatus[] = [
  MoneyTransferStatus.PROCESSING,
  MoneyTransferStatus.SENT,
  MoneyTransferStatus.COMPLETED,
]

function pctDelta(current: number, prior: number): number | null {
  if (prior <= 0) return current > 0 ? null : 0
  return Math.round(((current - prior) / prior) * 1000) / 10
}

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = session.id

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    const weekStart = startOfWeekMonday(now)

    const settings = await prisma.systemSettings.findFirst({ select: { currency: true } })
    const reportingCurrency = (settings?.currency || "USD").trim().toUpperCase()

    const walletRow = await prisma.wallet.findUnique({
      where: { userId },
      select: { balance: true, currency: true },
    })

    const walletCurrencyRaw = (walletRow?.currency || reportingCurrency).toUpperCase()
    const [currencyRow, walletCurRow] = await Promise.all([
      prisma.currency.findFirst({ where: { isDefault: true }, select: { code: true, symbol: true } }),
      prisma.currency.findFirst({
        where: { code: { equals: walletCurrencyRaw, mode: "insensitive" } },
        select: { symbol: true, code: true },
      }),
    ])

    const walletCurrency = (walletCurRow?.code || walletCurrencyRaw || currencyRow?.code || reportingCurrency).toUpperCase()
    const walletSymbol =
      walletCurRow?.symbol ||
      currencyRow?.symbol ||
      (walletCurrency === "USD" ? "$" : walletCurrency === "NGN" ? "₦" : walletCurrency)

    const monthOrderWhere = {
      customerId: userId,
      isChildOrder: false,
      createdAt: { gte: monthStart, lte: monthEnd },
      status: { notIn: SPEND_EXCLUDED },
    }

    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    const prevMonthOrderWhere = {
      customerId: userId,
      isChildOrder: false,
      createdAt: { gte: prevMonthStart, lte: prevMonthEnd },
      status: { notIn: SPEND_EXCLUDED },
    }

    const [monthOrdersMeta, monthAgg, prevMonthAgg] = await Promise.all([
      prisma.order.findMany({
        where: monthOrderWhere,
        select: { id: true, metadata: true },
      }),
      prisma.order.aggregate({
        where: monthOrderWhere,
        _sum: { total: true, discount: true },
      }),
      prisma.order.aggregate({
        where: prevMonthOrderWhere,
        _sum: { total: true },
      }),
    ])

    const monthSpend = monthAgg._sum.total ?? 0
    const monthDiscount = monthAgg._sum.discount ?? 0
    let loyaltySaved = 0
    for (const o of monthOrdersMeta) {
      const m = o.metadata as { loyalty?: { discountAmount?: number } } | null
      const ld = m?.loyalty?.discountAmount
      if (typeof ld === "number" && ld > 0) loyaltySaved += ld
    }

    const previousMonthSpend = prevMonthAgg._sum.total ?? 0
    const orderSpendMomGrowthPercent = pctDelta(monthSpend, previousMonthSpend)

    const preDiscount = monthSpend + monthDiscount
    const monthSavedPercent = preDiscount > 0 ? Math.round((monthDiscount / preDiscount) * 1000) / 10 : 0

    const orderIds = monthOrdersMeta.map((o) => o.id)
    const promoAgg =
      orderIds.length > 0
        ? await prisma.promoCodeUsage.aggregate({
            where: { orderId: { in: orderIds } },
            _sum: { discount: true },
          })
        : { _sum: { discount: 0 as number | null } }

    const monthPromoSaved = promoAgg._sum.discount ?? 0

    const [activeOrdersCount, deliveredThisMonth] = await Promise.all([
      prisma.order.count({
        where: {
          customerId: userId,
          isChildOrder: false,
          status: { notIn: TERMINAL_FOR_ACTIVE },
        },
      }),
      prisma.order.count({
        where: {
          customerId: userId,
          isChildOrder: false,
          createdAt: { gte: monthStart, lte: monthEnd },
          status: { in: [OrderStatus.DELIVERED, OrderStatus.COMPLETED] },
        },
      }),
    ])

    const prevWeekStart = new Date(weekStart)
    prevWeekStart.setDate(prevWeekStart.getDate() - 7)

    let weekTransferTotal = 0
    let weekLabelCurrency = reportingCurrency
    let lastTransferAmount: number | null = null
    let lastTransferCurrency: string | null = null
    let transferWeekPaidCount = 0
    let transferPrevWeekPaidCount = 0
    let transferMonthPaidCount = 0
    let transferWowGrowthPercent: number | null = null
    let transferVsMonthPacePercent: number | null = null

    try {
      const transferPaid = TRANSFER_PAID
      const [weekRows, lastTx, tw, tpw, tm] = await Promise.all([
        prisma.moneyTransfer.findMany({
          where: {
            senderId: userId,
            status: { in: transferPaid },
            createdAt: { gte: weekStart },
          },
          select: { amount: true, currency: true },
        }),
        prisma.moneyTransfer.findFirst({
          where: {
            senderId: userId,
            status: { notIn: [MoneyTransferStatus.FAILED, MoneyTransferStatus.CANCELLED] },
          },
          orderBy: { createdAt: "desc" },
          select: { amount: true, currency: true },
        }),
        prisma.moneyTransfer.count({
          where: {
            senderId: userId,
            status: { in: transferPaid },
            createdAt: { gte: weekStart },
          },
        }),
        prisma.moneyTransfer.count({
          where: {
            senderId: userId,
            status: { in: transferPaid },
            createdAt: { gte: prevWeekStart, lt: weekStart },
          },
        }),
        prisma.moneyTransfer.count({
          where: {
            senderId: userId,
            status: { in: transferPaid },
            createdAt: { gte: monthStart, lte: monthEnd },
          },
        }),
      ])

      transferWeekPaidCount = tw
      transferPrevWeekPaidCount = tpw
      transferMonthPaidCount = tm
      transferWowGrowthPercent = pctDelta(transferWeekPaidCount, transferPrevWeekPaidCount)

      const dayOfMonth = now.getDate()
      const weeksElapsedThisMonth = Math.max(1, Math.ceil(dayOfMonth / 7))
      const avgPaidPerWeekInMonth = transferMonthPaidCount / weeksElapsedThisMonth
      transferVsMonthPacePercent =
        avgPaidPerWeekInMonth > 0
          ? Math.round(
              ((transferWeekPaidCount - avgPaidPerWeekInMonth) / avgPaidPerWeekInMonth) * 1000
            ) / 10
          : transferWeekPaidCount > 0
            ? null
            : 0

      if (lastTx) {
        lastTransferAmount = lastTx.amount
        lastTransferCurrency = (lastTx.currency || "USD").trim().toUpperCase()
      }

      for (const t of weekRows) {
        weekTransferTotal += t.amount
        weekLabelCurrency = (t.currency || walletCurrency).toUpperCase()
      }
    } catch (mtErr) {
      console.warn("home-insights: money transfers section skipped:", mtErr)
    }

    return NextResponse.json({
      reportingCurrency,
      walletBalance: walletRow?.balance ?? 0,
      walletCurrency,
      walletSymbol,
      monthSpend,
      previousMonthSpend,
      orderSpendMomGrowthPercent,
      monthDiscount,
      monthSavedPercent,
      monthPromoSaved,
      monthLoyaltySaved: loyaltySaved,
      activeOrdersCount,
      deliveredThisMonth,
      weekTransferTotal,
      weekTransferCurrency: weekLabelCurrency,
      lastTransferAmount,
      lastTransferCurrency,
      transferWeekPaidCount,
      transferPrevWeekPaidCount,
      transferMonthPaidCount,
      transferWowGrowthPercent,
      transferVsMonthPacePercent,
    })
  } catch (e) {
    console.error("home-insights:", e)
    return NextResponse.json({ error: "Failed to load insights" }, { status: 500 })
  }
}
