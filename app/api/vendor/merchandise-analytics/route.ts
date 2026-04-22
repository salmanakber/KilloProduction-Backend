import { type NextRequest, NextResponse } from "next/server"
import type { Module } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import {
  getVendorMerchandiseCredits,
  sumCreditsInRange,
} from "@/lib/vendor-wallet-revenue"

type RangeKey = "7d" | "30d" | "1y"

const MODULES: Module[] = ["PHARMACY", "FOOD", "GROCERY", "AUTO_PARTS"]

function parseRange(raw: string | null): RangeKey {
  const r = (raw || "30d").toLowerCase()
  if (r === "7d" || r === "7") return "7d"
  if (r === "1y" || r === "12m" || r === "year") return "1y"
  return "30d"
}

function rangeBounds(range: RangeKey): { start: Date; end: Date; prevStart: Date } {
  const end = new Date()
  let days = 30
  if (range === "7d") days = 7
  if (range === "1y") days = 365
  const ms = days * 24 * 60 * 60 * 1000
  const start = new Date(end.getTime() - ms)
  const prevStart = new Date(start.getTime() - ms)
  return { start, end, prevStart }
}

async function resolveVendorContext(
  userId: string,
  requested: string | null,
): Promise<
  | { ok: true; module: Module; pharmacyId: string | null }
  | { ok: false; status: number; error: string }
> {
  const [pharmacy, autoStore, restaurant, grocery] = await Promise.all([
    prisma.pharmacy.findUnique({ where: { userId }, select: { id: true } }),
    prisma.autoPartsStore.findUnique({ where: { userId }, select: { id: true } }),
    prisma.restaurant.findUnique({ where: { userId }, select: { id: true } }),
    prisma.groceryStore.findUnique({ where: { userId }, select: { id: true } }),
  ])

  const inferred: Array<{ module: Module; pharmacyId: string | null }> = []
  if (pharmacy) inferred.push({ module: "PHARMACY", pharmacyId: pharmacy.id })
  if (autoStore) inferred.push({ module: "AUTO_PARTS", pharmacyId: null })
  if (restaurant) inferred.push({ module: "FOOD", pharmacyId: null })
  if (grocery) inferred.push({ module: "GROCERY", pharmacyId: null })

  if (inferred.length === 0) {
    return { ok: false, status: 404, error: "No vendor storefront linked to this account" }
  }

  if (requested && MODULES.includes(requested as Module)) {
    const m = requested as Module
    const hit = inferred.find((x) => x.module === m)
    if (hit) return { ok: true, ...hit }
    return { ok: false, status: 400, error: "Requested module does not match your vendor profile" }
  }

  return { ok: true, ...inferred[0] }
}

function buildChart(
  txs: Array<{ amount: unknown; createdAt: Date }>,
  range: RangeKey,
): { labels: string[]; values: number[] } {
  const now = new Date()
  if (range === "7d") {
    const labels: string[] = []
    const values: number[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const next = new Date(d)
      next.setDate(next.getDate() + 1)
      labels.push(d.toLocaleDateString("en-US", { weekday: "short" }))
      values.push(sumCreditsInRange(txs, d, next))
    }
    return { labels, values }
  }
  if (range === "30d") {
    const labels: string[] = []
    const values: number[] = []
    for (let w = 5; w >= 0; w--) {
      const endSlice = new Date(now)
      endSlice.setDate(endSlice.getDate() - w * 5)
      endSlice.setHours(23, 59, 59, 999)
      const startSlice = new Date(endSlice)
      startSlice.setDate(startSlice.getDate() - 4)
      startSlice.setHours(0, 0, 0, 0)
      const endExclusive = new Date(endSlice)
      endExclusive.setMilliseconds(endExclusive.getMilliseconds() + 1)
      labels.push(`W${6 - w}`)
      values.push(sumCreditsInRange(txs, startSlice, endExclusive))
    }
    return { labels, values }
  }
  const labels: string[] = []
  const values: number[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    labels.push(d.toLocaleDateString("en-US", { month: "short" }))
    values.push(sumCreditsInRange(txs, d, next))
  }
  return { labels, values }
}

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session || session.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const range = parseRange(searchParams.get("range"))
    const moduleParam = searchParams.get("module")
    const ctx = await resolveVendorContext(session.id, moduleParam)
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status })
    }

    const { start, end, prevStart } = rangeBounds(range)
    const { module, pharmacyId } = ctx

    const { txs: allTxs } = await getVendorMerchandiseCredits({
      vendorUserId: session.id,
      module,
      pharmacyId,
    })

    const inCurrent = allTxs.filter((t) => {
      const d = new Date(t.createdAt)
      return d >= start && d <= end
    })
    const inPrev = allTxs.filter((t) => {
      const d = new Date(t.createdAt)
      return d >= prevStart && d < start
    })

    const netRevenue = inCurrent.reduce((s, t) => s + Number(t.amount || 0), 0)
    const prevRevenue = inPrev.reduce((s, t) => s + Number(t.amount || 0), 0)
    const growthPct =
      prevRevenue > 0 ? ((netRevenue - prevRevenue) / prevRevenue) * 100 : netRevenue > 0 ? 100 : 0

    const [platformFeesAgg, vendorCommissionPaid] = await Promise.all([
      prisma.vendorCommission.aggregate({
        where: {
          vendorId: session.id,
          module,
          commissionType: "PLATFORM_FEE",
          status: { not: "CANCELLED" },
          createdAt: { gte: start, lte: end },
        },
        _sum: { commissionAmount: true },
      }),
      prisma.vendorCommission.aggregate({
        where: {
          vendorId: session.id,
          module,
          commissionType: "VENDOR_COMMISSION",
          status: { not: "CANCELLED" },
          createdAt: { gte: start, lte: end },
        },
        _sum: { commissionAmount: true },
      }),
    ])

    const platformFees = Number(platformFeesAgg._sum.commissionAmount || 0)
    const vendorFeesToPlatform = Number(vendorCommissionPaid._sum.commissionAmount || 0)

    const wallet = await prisma.wallet.findUnique({
      where: { userId: session.id },
      select: { balance: true, currency: true },
    })

    const settledStatuses = ["DELIVERED", "COMPLETED"] as const
    const vendorOrderOr: Array<{ vendorId: string } | { pharmacyId: string }> = [{ vendorId: session.id }]
    if (pharmacyId) vendorOrderOr.push({ pharmacyId })
    const ordersInRange = await prisma.order.findMany({
      where: {
        module,
        status: { in: [...settledStatuses] },
        createdAt: { gte: start, lte: end },
        OR: vendorOrderOr,
      },
      select: {
        id: true,
        orderItems: {
          select: {
            productId: true,
            productName: true,
            quantity: true,
            totalPrice: true,
          },
        },
      },
    })

    const productMap = new Map<
      string,
      { id: string; name: string; qty: number; revenue: number }
    >()
    for (const o of ordersInRange) {
      for (const it of o.orderItems) {
        const pid = it.productId || "unknown"
        const name = it.productName || "Item"
        const qty = it.quantity || 0
        const rev = Number(it.totalPrice ?? 0)
        const cur = productMap.get(pid)
        if (cur) {
          cur.qty += qty
          cur.revenue += rev
        } else {
          productMap.set(pid, { id: pid, name, qty, revenue: rev })
        }
      }
    }

    const topProducts = [...productMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((p, i) => ({
        rank: i + 1,
        id: p.id,
        name: p.name,
        category: module,
        qty: p.qty,
        revenue: p.revenue,
      }))

    const orderCount = new Set(inCurrent.map((t) => t.orderId).filter(Boolean)).size
    const chart = buildChart(inCurrent, range)

    return NextResponse.json({
      module,
      range,
      walletBalance: Number(wallet?.balance ?? 0),
      walletCurrency: wallet?.currency ?? "NGN",
      netVendorEarnings: netRevenue,
      platformFeesReported: platformFees,
      vendorCommissionPaid: vendorFeesToPlatform,
      growthPct,
      ordersSettled: orderCount,
      chart,
      topProducts,
    })
  } catch (e) {
    console.error("merchandise-analytics", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
