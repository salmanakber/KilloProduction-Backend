import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  logMoneyTransferAdminAction,
  MONEY_TRANSFER_PAYOUT_ENTITY,
  MoneyAdminAuthError,
  requireMoneyTransferAdmin,
} from "@/lib/money-transfer-admin"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireMoneyTransferAdmin(request)
    const payout = await prisma.moneyTransferPayout.findUnique({
      where: { id: params.id },
      include: {
        transfer: {
          select: {
            id: true,
            reference: true,
            status: true,
            amount: true,
            currency: true,
            senderId: true,
            receiverId: true,
          },
        },
      },
    })
    if (!payout) {
      return NextResponse.json({ error: "Payout not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true, payout })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("payout record GET:", error)
    return NextResponse.json({ error: "Failed to load payout" }, { status: 500 })
  }
}

const EDITABLE = [
  "status",
  "amount",
  "currency",
  "bankName",
  "accountNumber",
  "accountName",
  "bankCode",
  "failureReason",
  "paystackReference",
  "metadata",
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

    const updated = await prisma.moneyTransferPayout.update({
      where: { id: params.id },
      data,
    })

    await logMoneyTransferAdminAction({
      performedBy: user.id,
      action: "MONEY_PAYOUT_RECORD_EDIT",
      entityType: MONEY_TRANSFER_PAYOUT_ENTITY,
      entityId: params.id,
      details: { reason: body.reason, changes: data },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({ success: true, payout: updated })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 })
  }
}
