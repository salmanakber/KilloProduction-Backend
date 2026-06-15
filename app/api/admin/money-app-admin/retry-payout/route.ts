import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  assertPayoutAdminConfirmation,
  logMoneyTransferAdminAction,
  MONEY_TRANSFER_PAYOUT_ENTITY,
  MoneyAdminAuthError,
  requireMoneyTransferAdmin,
} from "@/lib/money-transfer-admin"
import { processTransferPayoutViaPaystack } from "@/lib/money-transfer-payout-admin"

export async function POST(request: NextRequest) {
  try {
    const { user, meta } = await requireMoneyTransferAdmin(request)
    const { payoutId, confirmToken, reason } = await request.json()

    if (!payoutId) {
      return NextResponse.json(
        { error: "Payout ID is required" },
        { status: 400 }
      )
    }

    // Get payout
    const payout = await prisma.moneyTransferPayout.findUnique({
      where: { id: payoutId },
      include: {
        transfer: true,
      },
    })

    if (!payout) {
      return NextResponse.json(
        { error: "Payout not found" },
        { status: 404 }
      )
    }

    assertPayoutAdminConfirmation(confirmToken, payout.id)
    if (!reason?.trim()) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 })
    }

    if (!["PENDING", "FAILED"].includes(payout.status)) {
      return NextResponse.json(
        { error: `Cannot retry payout with status: ${payout.status}` },
        { status: 400 },
      )
    }

    const processResult = await processTransferPayoutViaPaystack(payout.id)

    await logMoneyTransferAdminAction({
      performedBy: user.id,
      action: "MONEY_TRANSFER_PAYOUT_RETRY",
      entityType: MONEY_TRANSFER_PAYOUT_ENTITY,
      entityId: payout.id,
      details: {
        transferReference: payout.transfer.reference,
        reason,
        paystackReference: processResult.paystackReference,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({
      success: true,
      payout: {
        id: payout.id,
        status: "PROCESSING",
        paystackReference: processResult.paystackReference,
        retryCount: processResult.retryCount,
      },
    })
  } catch (error: unknown) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Error retrying payout:", error)
    const message = error instanceof Error ? error.message : "Failed to retry payout"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
