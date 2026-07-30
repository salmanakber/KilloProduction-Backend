import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MoneyAdminAuthError, requireMoneyTransferAdmin } from "@/lib/money-transfer-admin"

export async function GET(request: NextRequest) {
  try {
    await requireMoneyTransferAdmin(request)

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const limit = Math.min(Number(searchParams.get("limit") || 50), 100)
    const offset = Number(searchParams.get("offset") || 0)

    const where = status ? { status: status as any } : {}

    const [groups, total] = await Promise.all([
      prisma.ajoGroup.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          creator: { select: { id: true, name: true, email: true } },
          members: { where: { status: "ACTIVE" } },
          _count: { select: { cycles: true } },
        },
      }),
      prisma.ajoGroup.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        status: g.status,
        contributionAmount: g.contributionAmount,
        currency: g.currency,
        frequency: g.frequency,
        maxMembers: g.maxMembers,
        memberCount: g.members.length,
        currentCycle: g.currentCycle,
        totalCycles: g.totalCycles,
        treasuryBalance: g.treasuryBalance,
        inviteCode: g.inviteCode,
        creator: g.creator,
        cycleCount: g._count.cycles,
        createdAt: g.createdAt.toISOString(),
        startedAt: g.startedAt?.toISOString() ?? null,
      })),
      pagination: { total, limit, offset },
    })
  } catch (error: unknown) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("admin ajo/groups GET:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
