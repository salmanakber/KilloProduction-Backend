import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  logMoneyTransferAdminAction,
  MONEY_TRANSFER_AUDIT_ENTITY,
  MoneyAdminAuthError,
  requireMoneyTransferAdmin,
} from "@/lib/money-transfer-admin"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireMoneyTransferAdmin(request)
    const transaction = await prisma.moneyTransferWalletTransaction.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        wallet: { select: { id: true, currency: true, balance: true } },
        transfer: { select: { id: true, reference: true } },
        withdrawal: { select: { id: true, status: true } },
      },
    })
    if (!transaction) {
      return NextResponse.json({ error: "Wallet transaction not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true, transaction })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("wallet-tx record GET:", error)
    return NextResponse.json({ error: "Failed to load wallet transaction" }, { status: 500 })
  }
}

const EDITABLE = [
  "description",
  "amount",
  "currency",
  "type",
  "metadata",
  "reference",
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
    const data: Record<string, unknown> = {}
    for (const key of EDITABLE) {
      if (body[key] !== undefined) data[key] = body[key]
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No editable fields" }, { status: 400 })
    }

    const updated = await prisma.moneyTransferWalletTransaction.update({
      where: { id: params.id },
      data,
    })

    await logMoneyTransferAdminAction({
      performedBy: user.id,
      action: "MONEY_WALLET_TX_EDIT",
      entityType: MONEY_TRANSFER_AUDIT_ENTITY,
      entityId: params.id,
      details: { reason: body.reason, changes: data },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({ success: true, transaction: updated })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 })
  }
}
