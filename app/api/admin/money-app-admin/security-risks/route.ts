import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  logMoneyTransferAdminAction,
  MONEY_TRANSFER_AUDIT_ENTITY,
  MoneyAdminAuthError,
  requireMoneyTransferAdmin,
} from "@/lib/money-transfer-admin"

const RISK_SIGNALS = [
  "DEVELOPER_MODE",
  "SIMULATOR",
  "NEW_DEVICE",
  "UNUSUAL_TIME",
  "LARGE_AMOUNT_SPIKE",
  "NEW_BENEFICIARY",
  "FREQUENT_RETRIES",
  "IP_COUNTRY_CHANGE",
  "VPN_DETECTED",
] as const

function parseSignals(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((s) => String(s))
}

export async function GET(request: NextRequest) {
  try {
    await requireMoneyTransferAdmin(request)
    const { searchParams } = new URL(request.url)
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50", 10))
    const offset = parseInt(searchParams.get("offset") || "0", 10)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const effectiveOffset = searchParams.get("page") ? (page - 1) * limit : offset

    const hours = Math.min(168, Math.max(1, parseInt(searchParams.get("hours") || "24", 10)))
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)
    const blockedOnly = searchParams.get("blocked") === "true"
    const stepUpOnly = searchParams.get("stepUp") === "true"
    const userId = searchParams.get("userId")?.trim() || undefined
    const action = searchParams.get("action")?.trim() || undefined
    const signal = searchParams.get("signal")?.trim() || undefined

    const where: {
      createdAt: { gte: Date }
      blocked?: boolean
      stepUpRequired?: boolean
      userId?: string
      action?: string
    } = { createdAt: { gte: since } }
    if (blockedOnly) where.blocked = true
    if (stepUpOnly) where.stepUpRequired = true
    if (userId) where.userId = userId
    if (action) where.action = action

    const [rawLogs, totalBeforeSignal, signalGroups, blocked24h, stepUp24h, atRiskGroups] =
      await Promise.all([
        prisma.moneyTransferRiskLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: signal ? 500 : limit,
          skip: signal ? 0 : effectiveOffset,
          include: {
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        }),
        prisma.moneyTransferRiskLog.count({ where }),
        prisma.moneyTransferRiskLog.findMany({
          where: { createdAt: { gte: since }, blocked: true },
          select: { signals: true },
          take: 2000,
        }),
        prisma.moneyTransferRiskLog.count({
          where: { createdAt: { gte: since }, blocked: true },
        }),
        prisma.moneyTransferRiskLog.count({
          where: { createdAt: { gte: since }, stepUpRequired: true },
        }),
        prisma.moneyTransferRiskLog.groupBy({
          by: ["userId"],
          where: {
            createdAt: { gte: new Date(Date.now() - 15 * 60_000) },
            blocked: true,
          },
          _count: { id: true },
        }),
      ])

    let logs = rawLogs
    let totalFiltered = totalBeforeSignal
    if (signal) {
      const filtered = rawLogs.filter((log) => parseSignals(log.signals).includes(signal))
      totalFiltered = filtered.length
      logs = filtered.slice(effectiveOffset, effectiveOffset + limit)
    }

    const signalBreakdown: Record<string, number> = {}
    for (const row of signalGroups) {
      for (const sig of parseSignals(row.signals)) {
        signalBreakdown[sig] = (signalBreakdown[sig] || 0) + 1
      }
    }

    const atRiskUserIds = atRiskGroups
      .filter((g) => g._count.id >= 4)
      .map((g) => g.userId)

    const atRiskUsers =
      atRiskUserIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: atRiskUserIds } },
            select: { id: true, name: true, email: true, phone: true },
          })
        : []

    const atRisk = atRiskGroups
      .filter((g) => g._count.id >= 4)
      .map((g) => {
        const user = atRiskUsers.find((u) => u.id === g.userId)
        return {
          userId: g.userId,
          recentBlocks15m: g._count.id,
          user: user
            ? {
                name: user.name,
                email: user.email,
                phone: user.phone,
              }
            : null,
        }
      })
      .sort((a, b) => b.recentBlocks15m - a.recentBlocks15m)

    const formattedLogs = logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      user: log.user,
      action: log.action,
      riskScore: log.riskScore,
      signals: parseSignals(log.signals),
      blocked: log.blocked,
      stepUpRequired: log.stepUpRequired,
      ipAddress: log.ipAddress,
      countryCode: log.countryCode,
      deviceFingerprint: log.deviceFingerprint,
      metadata: log.metadata as Record<string, unknown> | null,
      createdAt: log.createdAt.toISOString(),
    }))

    return NextResponse.json({
      success: true,
      thresholds: {
        stepUpScore: 40,
        blockScore: 80,
        frequentRetriesWindowMinutes: 15,
        frequentRetriesSignalAt: 4,
        frequentRetriesBlockAt: 8,
      },
      summary: {
        hours,
        totalInWindow: totalBeforeSignal,
        blockedCount: blocked24h,
        stepUpCount: stepUp24h,
        atRiskUserCount: atRisk.length,
        signalBreakdown,
      },
      atRisk,
      logs: formattedLogs,
      pagination: {
        total: totalFiltered,
        limit,
        offset: effectiveOffset,
        page,
        hasMore: effectiveOffset + logs.length < totalFiltered,
      },
      availableSignals: RISK_SIGNALS,
      availableActions: [
        "MONEY_APP_OPEN",
        "SEND_MONEY",
        "WALLET_WITHDRAW",
        "SCHEDULED_TRANSFER",
        "VTPASS_PAY",
        "RESET_TRANSFER_PIN",
      ],
    })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("security-risks GET:", error)
    return NextResponse.json({ error: "Failed to load security risks" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, meta } = await requireMoneyTransferAdmin(request)
    const body = await request.json()
    const targetUserId = String(body.userId || "").trim()
    if (!targetUserId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }

    const deleted = await prisma.moneyTransferRiskLog.deleteMany({
      where: { userId: targetUserId },
    })

    await logMoneyTransferAdminAction({
      performedBy: user.id,
      action: "MONEY_TRANSFER_CLEAR_RISK_LOGS",
      entityType: MONEY_TRANSFER_AUDIT_ENTITY,
      entityId: targetUserId,
      details: { deletedCount: deleted.count },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({
      success: true,
      deletedCount: deleted.count,
      message: `Cleared ${deleted.count} risk log entries for user.`,
    })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("security-risks POST:", error)
    return NextResponse.json({ error: "Failed to clear risk logs" }, { status: 500 })
  }
}
