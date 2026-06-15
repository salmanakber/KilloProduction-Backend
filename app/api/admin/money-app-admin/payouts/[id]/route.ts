import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  assertPayoutAdminConfirmation,
  logMoneyTransferAdminAction,
  MONEY_TRANSFER_PAYOUT_ENTITY,
  MoneyAdminAuthError,
  payoutAdminConfirmToken,
  requireMoneyTransferAdmin,
} from "@/lib/money-transfer-admin"
import {
  markTransferPayoutCompletedManually,
  markTransferPayoutFailedManually,
  processTransferPayoutViaPaystack,
} from "@/lib/money-transfer-payout-admin"

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
          include: {
            sender: { select: { id: true, name: true, email: true } },
            receiver: { select: { id: true, name: true, email: true } },
          },
        },
      },
    })
    if (!payout) {
      return NextResponse.json({ error: "Payout not found" }, { status: 404 })
    }
    return NextResponse.json({
      success: true,
      payout,
      confirmToken: payoutAdminConfirmToken(payout.id),
    })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to load payout" }, { status: 500 })
  }
}

type PayoutAction = "process" | "mark_completed" | "mark_failed"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json()
    const { action, reason, confirmToken } = body as {
      action: PayoutAction
      reason?: string
      confirmToken?: string
    }

    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 })
    }

    const payout = await prisma.moneyTransferPayout.findUnique({
      where: { id: params.id },
      include: { transfer: { select: { id: true, reference: true } } },
    })

    if (!payout) {
      return NextResponse.json({ error: "Payout not found" }, { status: 404 })
    }

    const { user, meta } = await requireMoneyTransferAdmin(request)

    assertPayoutAdminConfirmation(confirmToken, params.id)
    if (!reason?.trim()) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 })
    }

    let result: unknown
    let logAction = ""

    switch (action) {
      case "process": {
        result = await processTransferPayoutViaPaystack(params.id)
        logAction = "MONEY_TRANSFER_PAYOUT_PROCESS"
        break
      }
      case "mark_completed": {
        result = await markTransferPayoutCompletedManually(params.id, user.id, reason.trim())
        logAction = "MONEY_TRANSFER_PAYOUT_MANUAL_COMPLETE"
        break
      }
      case "mark_failed": {
        result = await markTransferPayoutFailedManually(params.id, user.id, reason.trim())
        logAction = "MONEY_TRANSFER_PAYOUT_MANUAL_FAILED"
        break
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }

    await logMoneyTransferAdminAction({
      performedBy: user.id,
      action: logAction,
      entityType: MONEY_TRANSFER_PAYOUT_ENTITY,
      entityId: params.id,
      details: {
        reason: reason.trim(),
        transferReference: payout.transfer.reference,
        result,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({ success: true, action, result })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("payout action:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed" },
      { status: 500 },
    )
  }
}
