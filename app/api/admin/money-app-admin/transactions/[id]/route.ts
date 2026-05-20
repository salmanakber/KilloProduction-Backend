import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  logMoneyTransferAdminAction,
  MONEY_TRANSFER_AUDIT_ENTITY,
  MoneyAdminAuthError,
  requireMoneyTransferAdmin,
} from "@/lib/money-transfer-admin"
import { verifyPaystackTransfer } from "@/lib/money-transfer-paystack-admin"

/** URL segment may be Prisma `id` (cuid) or unique `reference` (e.g. MT_… shown to customers). */
function transferLookupWhere(slug: string) {
  const q = slug.trim()
  if (!q) return null
  return { OR: [{ id: q }, { reference: q }] }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user, meta } = await requireMoneyTransferAdmin(request)

    const where = transferLookupWhere(params.id)
    if (!where) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 })
    }

    const transfer = await prisma.moneyTransfer.findFirst({
      where,
      include: {
        sender: { select: { id: true, name: true, email: true, phone: true } },
        receiver: { select: { id: true, name: true, email: true, phone: true } },
        payout: true,
        walletTransactions: { orderBy: { createdAt: "desc" } },
        supportCases: {
          orderBy: { createdAt: "desc" },
          include: { _count: { select: { notes: true } } },
        },
      },
    })

    if (!transfer) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 })
    }

    let paystackTransferStatus: unknown = null
    if (transfer.payout?.paystackReference) {
      try {
        paystackTransferStatus = await verifyPaystackTransfer(transfer.payout.paystackReference)
      } catch {
        paystackTransferStatus = null
      }
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: MONEY_TRANSFER_AUDIT_ENTITY,
        entityId: transfer.id,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { performer: { select: { id: true, name: true, email: true } } },
    })

    await logMoneyTransferAdminAction({
      performedBy: user.id,
      action: "MONEY_TRANSFER_VIEW_DETAIL",
      entityType: MONEY_TRANSFER_AUDIT_ENTITY,
      entityId: transfer.id,
      details: { reference: transfer.reference },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({
      success: true,
      transfer,
      paystackTransferStatus,
      auditLogs,
    })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("transaction detail:", error)
    return NextResponse.json({ error: "Failed to load transfer" }, { status: 500 })
  }
}

const TRANSFER_EDITABLE = [
  "status",
  "amount",
  "currency",
  "receiveAmount",
  "receiveCurrency",
  "description",
  "metadata",
  "settlementMode",
] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user, meta } = await requireMoneyTransferAdmin(request, { superAdminOnly: true })
    const body = await request.json()
    if (!body.reason?.trim()) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 })
    }

    const where = transferLookupWhere(params.id)
    if (!where) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 })
    }

    const existing = await prisma.moneyTransfer.findFirst({
      where,
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    for (const key of TRANSFER_EDITABLE) {
      if (body[key] !== undefined) data[key] = body[key]
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No editable fields" }, { status: 400 })
    }

    const updated = await prisma.moneyTransfer.update({
      where: { id: existing.id },
      data,
    })

    await logMoneyTransferAdminAction({
      performedBy: user.id,
      action: "MONEY_TRANSFER_RECORD_EDIT",
      entityType: MONEY_TRANSFER_AUDIT_ENTITY,
      entityId: existing.id,
      details: { reason: body.reason, changes: data, lookup: params.id },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({ success: true, transfer: updated })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 })
  }
}
