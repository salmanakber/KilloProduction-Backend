import { NextRequest, NextResponse } from "next/server"
import { MoneyTransferStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  assertAdminConfirmation,
  logMoneyTransferAdminAction,
  MONEY_TRANSFER_AUDIT_ENTITY,
  MoneyAdminAuthError,
  requireMoneyTransferAdmin,
} from "@/lib/money-transfer-admin"
import { processMoneyTransferAdminRefund } from "@/lib/money-transfer-admin-refund"
import { creditMoneyTransferWalletFromTransfer } from "@/lib/money-transfer-wallet"

function transferLookupWhere(slug: string) {
  const q = slug.trim()
  if (!q) return null
  return { OR: [{ id: q }, { reference: q }] }
}

type ActionType =
  | "CANCEL"
  | "MARK_FAILED"
  | "MARK_COMPLETED"
  | "FORCE_WALLET_CREDIT"
  | "REFUND"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json()
    const { action, reason, confirmToken, reverseWallet, stripeRefund } = body as {
      action: ActionType
      reason?: string
      confirmToken?: string
      reverseWallet?: boolean
      stripeRefund?: boolean
    }

    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 })
    }

    const where = transferLookupWhere(params.id)
    if (!where) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 })
    }

    const transfer = await prisma.moneyTransfer.findFirst({
      where,
      select: { id: true, reference: true, status: true },
    })
    if (!transfer) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 })
    }

    const destructive = ["CANCEL", "MARK_FAILED", "REFUND", "FORCE_WALLET_CREDIT"].includes(action)
    const superOnly = ["REFUND", "FORCE_WALLET_CREDIT"].includes(action)

    const { user, meta } = await requireMoneyTransferAdmin(request, {
      superAdminOnly: superOnly,
    })

    if (destructive) {
      assertAdminConfirmation(confirmToken, transfer.reference)
    }

    if (!reason?.trim() && destructive) {
      return NextResponse.json({ error: "reason is required for this action" }, { status: 400 })
    }

    let result: unknown

    switch (action) {
      case "CANCEL": {
        if (!["PENDING", "PROCESSING"].includes(transfer.status)) {
          return NextResponse.json(
            { error: `Cannot cancel transfer in status ${transfer.status}` },
            { status: 400 },
          )
        }
        result = await prisma.moneyTransfer.update({
          where: { id: transfer.id },
          data: {
            status: MoneyTransferStatus.CANCELLED,
            metadata: {
              adminCancel: { at: new Date().toISOString(), by: user.id, reason },
            } as Prisma.InputJsonValue,
          },
        })
        break
      }
      case "MARK_FAILED": {
        result = await prisma.moneyTransfer.update({
          where: { id: transfer.id },
          data: {
            status: MoneyTransferStatus.FAILED,
            failedAt: new Date(),
            metadata: {
              adminMarkFailed: { at: new Date().toISOString(), by: user.id, reason },
            } as Prisma.InputJsonValue,
          },
        })
        break
      }
      case "MARK_COMPLETED": {
        result = await prisma.moneyTransfer.update({
          where: { id: transfer.id },
          data: {
            status: MoneyTransferStatus.COMPLETED,
            completedAt: new Date(),
            metadata: {
              adminMarkCompleted: { at: new Date().toISOString(), by: user.id, reason },
            } as Prisma.InputJsonValue,
          },
        })
        break
      }
      case "FORCE_WALLET_CREDIT": {
        result = await creditMoneyTransferWalletFromTransfer(transfer.id)
        break
      }
      case "REFUND": {
        result = await processMoneyTransferAdminRefund({
          transferId: transfer.id,
          adminId: user.id,
          reason: reason!.trim(),
          reverseWallet: reverseWallet !== false,
          stripeRefund: stripeRefund !== false,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        })
        return NextResponse.json({ success: true, action, result })
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }

    await logMoneyTransferAdminAction({
      performedBy: user.id,
      action: `MONEY_TRANSFER_${action}`,
      entityType: MONEY_TRANSFER_AUDIT_ENTITY,
      entityId: transfer.id,
      details: { reason, reference: transfer.reference },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({ success: true, action, result })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("transaction action:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed" },
      { status: 500 },
    )
  }
}
