import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  MONEY_TRANSFER_AUDIT_ENTITY,
  MONEY_TRANSFER_CASE_ENTITY,
  MONEY_TRANSFER_PAYOUT_ENTITY,
  MoneyAdminAuthError,
  requireMoneyTransferAdmin,
} from "@/lib/money-transfer-admin"

export async function GET(request: NextRequest) {
  try {
    await requireMoneyTransferAdmin(request)
    const { searchParams } = new URL(request.url)
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50", 10))
    const offset = parseInt(searchParams.get("offset") || "0", 10)
    const entityId = searchParams.get("entityId")

    const where = {
      OR: [
        { entityType: MONEY_TRANSFER_AUDIT_ENTITY },
        { entityType: MONEY_TRANSFER_CASE_ENTITY },
        { entityType: MONEY_TRANSFER_PAYOUT_ENTITY },
        { action: { startsWith: "MONEY_TRANSFER_" } },
      ],
      ...(entityId ? { entityId } : {}),
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          performer: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      logs,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to load audit logs" }, { status: 500 })
  }
}
