import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  assertAdminConfirmation,
  logMoneyTransferAdminAction,
  MoneyAdminAuthError,
  MONEY_TRANSFER_AUDIT_ENTITY,
  requireMoneyTransferAdmin,
} from "@/lib/money-transfer-admin"
import {
  processMoneyWalletWithdrawal,
  rejectMoneyWalletWithdrawal,
} from "@/lib/money-wallet-withdrawal"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireMoneyTransferAdmin(request)
    const row = await prisma.moneyWalletWithdrawal.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        walletTransaction: true,
      },
    })
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true, withdrawal: row })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

/** SUPER_ADMIN metadata / status corrections (audit-logged). */
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
    const allowed = ["status", "failureReason", "scheduledProcessAt", "metadata"] as const
    const data: Record<string, unknown> = {}
    for (const key of allowed) {
      if (body[key] !== undefined) data[key] = body[key]
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No editable fields" }, { status: 400 })
    }
    const updated = await prisma.moneyWalletWithdrawal.update({
      where: { id: params.id },
      data,
    })
    await logMoneyTransferAdminAction({
      performedBy: user.id,
      action: "MONEY_WALLET_WITHDRAWAL_RECORD_EDIT",
      entityType: MONEY_TRANSFER_AUDIT_ENTITY,
      entityId: params.id,
      details: { reason: body.reason, changes: data },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })
    return NextResponse.json({ success: true, withdrawal: updated })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user, meta } = await requireMoneyTransferAdmin(request)
    const { action, reason, confirmToken } = await request.json()

    const row = await prisma.moneyWalletWithdrawal.findUnique({
      where: { id: params.id },
    })
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const ref = `WD-${row.id.slice(0, 8)}`
    if (action === "approve" || action === "process") {
      assertAdminConfirmation(confirmToken, ref)
      if (!reason?.trim()) {
        return NextResponse.json({ error: "reason is required" }, { status: 400 })
      }
      const result = await processMoneyWalletWithdrawal(params.id, {
        adminId: user.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      })
      return NextResponse.json({ success: true, result })
    }

    if (action === "reject") {
      assertAdminConfirmation(confirmToken, ref)
      if (!reason?.trim()) {
        return NextResponse.json({ error: "reason is required" }, { status: 400 })
      }
      await rejectMoneyWalletWithdrawal(params.id, reason.trim(), user.id, meta)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : "Action failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
