import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getMoneyTransferFxRate, recordFxSnapshotWhenChanged } from "@/lib/money-fx-rate"

function periodToMs(period: string): number {
  switch (period) {
    case "1D":
      return 24 * 60 * 60 * 1000
    case "1W":
      return 7 * 24 * 60 * 60 * 1000
    case "1M":
      return 30 * 24 * 60 * 60 * 1000
    default:
      return 24 * 60 * 60 * 1000
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = (searchParams.get("from") || "USD").trim().toUpperCase()
    const to = (searchParams.get("to") || "NGN").trim().toUpperCase()
    const period = searchParams.get("period") || "1D"

    const ms = periodToMs(period)
    const since = new Date(Date.now() - ms)

    const currentRate = await getMoneyTransferFxRate(from, to)
    if (currentRate != null) void recordFxSnapshotWhenChanged(from, to, currentRate)

    let snapshots = await prisma.moneyFxRateSnapshot.findMany({
      where: {
        fromCurrency: from,
        toCurrency: to,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "asc" },
      take: 2000,
    })

    // If nothing falls in the selected window (e.g. only older snapshots), still chart recent pair history.
    if (snapshots.length === 0) {
      const recent = await prisma.moneyFxRateSnapshot.findMany({
        where: { fromCurrency: from, toCurrency: to },
        orderBy: { createdAt: "desc" },
        take: 120,
      })
      snapshots = recent.slice().reverse()
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const [olderForCompare, firstInWindow] = await Promise.all([
      prisma.moneyFxRateSnapshot.findFirst({
        where: {
          fromCurrency: from,
          toCurrency: to,
          createdAt: { lt: weekAgo },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.moneyFxRateSnapshot.findFirst({
        where: {
          fromCurrency: from,
          toCurrency: to,
          createdAt: { gte: weekAgo },
        },
        orderBy: { createdAt: "asc" },
      }),
    ])

    let points = snapshots.map((s) => ({
      t: s.createdAt.toISOString(),
      rate: s.rate,
    }))

    const effectiveCurrent = currentRate ?? snapshots[snapshots.length - 1]?.rate ?? null

    // No rows in window yet: still return one point from live rate so the chart/banner aren’t empty.
    if (points.length === 0 && effectiveCurrent != null) {
      points = [{ t: new Date().toISOString(), rate: effectiveCurrent }]
    }

    let changeVsWeekPercent: number | null = null
    let bannerMessage = ""

    const baseline = olderForCompare?.rate ?? firstInWindow?.rate ?? snapshots[0]?.rate
    if (baseline != null && effectiveCurrent != null && baseline > 0) {
      changeVsWeekPercent = Number((((effectiveCurrent - baseline) / baseline) * 100).toFixed(2))
      const abs = Math.abs(changeVsWeekPercent)
      if (changeVsWeekPercent > 0.05) {
        bannerMessage = `Rates improved about ${abs.toFixed(1)}% vs last week for ${from}/${to}. Completing a transfer soon may capture better value.`
      } else if (changeVsWeekPercent < -0.05) {
        bannerMessage = `Rates are roughly ${abs.toFixed(1)}% weaker than last week for ${from}/${to}. Consider waiting if your transfer is not urgent.`
      } else {
        bannerMessage = `Rates for ${from}/${to} are steady versus last week. You can transfer with predictable costs.`
      }
    } else {
      bannerMessage =
        effectiveCurrent != null
          ? `Live ${from}/${to} rate is shown above. History fills in as we collect market snapshots.`
          : "Unable to load rate insights right now. Pull to refresh."
    }

    const changeInPeriodPercent =
      points.length >= 2 && points[0].rate > 0
        ? Number(
            (((points[points.length - 1].rate - points[0].rate) / points[0].rate) * 100).toFixed(2)
          )
        : null

    return NextResponse.json({
      success: true,
      from,
      to,
      period,
      currentRate: effectiveCurrent,
      points,
      changeVsWeekPercent,
      changeInPeriodPercent,
      bannerMessage,
    })
  } catch (error: any) {
    console.error("exchange-rates/history:", error)
    return NextResponse.json(
      { error: error.message || "Failed to load rate history" },
      { status: 500 }
    )
  }
}
