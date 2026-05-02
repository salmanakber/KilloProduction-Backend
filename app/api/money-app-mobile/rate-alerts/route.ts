import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getMoneyTransferFxRate } from "@/lib/money-fx-rate"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rows = await prisma.moneyRateAlert.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    })

    const enriched = await Promise.all(
      rows.map(async (a) => {
        const currentRate = await getMoneyTransferFxRate(a.fromCurrency, a.toCurrency)
        return {
          id: a.id,
          fromCurrency: a.fromCurrency,
          toCurrency: a.toCurrency,
          fromFlag: "",
          toFlag: "",
          currentRate: currentRate ?? 0,
          targetRate: a.targetRate,
          condition: a.condition,
          status: a.status,
          updatedAt: a.updatedAt.toISOString(),
        }
      })
    )

    const triggeredRecent = await prisma.moneyRateAlert.count({
      where: {
        userId: user.id,
        lastNotifiedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    })

    return NextResponse.json({
      success: true,
      alerts: enriched,
      triggeredRecent,
    })
  } catch (e: any) {
    console.error("rate-alerts GET:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const fromCurrency = (body.fromCurrency as string)?.toUpperCase()
    const toCurrency = (body.toCurrency as string)?.toUpperCase()
    const targetRate = Number(body.targetRate)
    const condition = (body.condition as string)?.toLowerCase()

    if (!fromCurrency || !toCurrency || !Number.isFinite(targetRate) || targetRate <= 0) {
      return NextResponse.json({ error: "Invalid currency pair or target" }, { status: 400 })
    }
    if (condition !== "above" && condition !== "below") {
      return NextResponse.json({ error: "condition must be above or below" }, { status: 400 })
    }

    const created = await prisma.moneyRateAlert.create({
      data: {
        userId: user.id,
        fromCurrency,
        toCurrency,
        targetRate,
        condition,
        status: "ACTIVE",
      },
    })

    return NextResponse.json({
      success: true,
      alert: {
        id: created.id,
        fromCurrency: created.fromCurrency,
        toCurrency: created.toCurrency,
        targetRate: created.targetRate,
        condition: created.condition,
        status: created.status,
      },
    })
  } catch (e: any) {
    console.error("rate-alerts POST:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
