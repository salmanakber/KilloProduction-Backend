import { prisma } from "@/lib/prisma"
import { getOrCreateMoneyTransferWallet } from "@/lib/money-transfer-wallet"
import {
  computeVtpassCommission,
  executeVtpassPayment,
  generateVtpassRequestId,
  getVtpassConfig,
  type VtpassServiceType,
} from "@/lib/vtpass"
import { enforceMoneyTransferSecurity } from "@/lib/money-transfer-risk"
import { NextRequest } from "next/server"

export async function purchaseVtpassService(args: {
  userId: string
  request?: NextRequest
  body?: Record<string, unknown>
  serviceType: VtpassServiceType
  serviceId: string
  billersCode: string
  amount: number
  phone?: string
  variationCode?: string
  scheduleId?: string
}) {
  if (args.request) {
    await enforceMoneyTransferSecurity({
      userId: args.userId,
      action: "VTPASS_PAY",
      request: args.request,
      body: args.body,
      amount: args.amount,
      currency: "NGN",
    })
  }

  const config = await getVtpassConfig()
  if (!config.isEnabled) {
    throw new Error("Bill payments are temporarily unavailable")
  }

  const amount = Math.round(args.amount * 100) / 100
  if (amount < 50) throw new Error("Minimum amount is ₦50")

  const commission = computeVtpassCommission(amount, args.serviceType, config)
  const customerPaid = Math.round((amount + commission) * 100) / 100

  const wallet = await getOrCreateMoneyTransferWallet(args.userId, "NGN")
  if (wallet.balance < customerPaid) {
    throw new Error(
      `Insufficient wallet balance. Need ₦${customerPaid.toFixed(2)}, available ₦${wallet.balance.toFixed(2)}`,
    )
  }

  const requestId = generateVtpassRequestId()

  const tx = await prisma.vtpassTransaction.create({
    data: {
      userId: args.userId,
      scheduleId: args.scheduleId,
      serviceType: args.serviceType,
      serviceId: args.serviceId,
      variationCode: args.variationCode,
      billersCode: args.billersCode,
      phone: args.phone,
      amount,
      commission,
      customerPaid,
      requestId,
      status: "PROCESSING",
    },
  })

  const walletTx = await prisma.$transaction(async (db) => {
    const w = await db.moneyTransferWallet.findUnique({ where: { id: wallet.id } })
    if (!w || w.balance < customerPaid) throw new Error("Insufficient balance")

    const updated = await db.moneyTransferWallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: customerPaid } },
    })

    return db.moneyTransferWalletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: args.userId,
        type: "DEBIT",
        amount: customerPaid,
        balanceAfter: updated.balance,
        currency: "NGN",
        description: `VTpass ${args.serviceType}: ${args.serviceId}`,
        reference: requestId,
        metadata: {
          vtpassTransactionId: tx.id,
          serviceType: args.serviceType,
          commission,
        },
      },
    })
  })

  await prisma.vtpassTransaction.update({
    where: { id: tx.id },
    data: { walletTxId: walletTx.id },
  })

  try {
    const result = await executeVtpassPayment({
      serviceId: args.serviceId,
      serviceType: args.serviceType,
      billersCode: args.billersCode,
      amount,
      phone: args.phone,
      variationCode: args.variationCode,
      requestId,
    })

    const status = result.delivered ? "DELIVERED" : "FAILED"

    await prisma.vtpassTransaction.update({
      where: { id: tx.id },
      data: {
        status,
        vtpassReference: String(result.reference),
        response: result.response as object,
        failureReason: result.delivered ? null : result.message || "VTpass failed",
      },
    })

    if (!result.delivered) {
      await refundVtpassWallet(args.userId, wallet.id, customerPaid, requestId, tx.id)
      throw new Error(result.message || "Payment failed. Wallet refunded.")
    }

    return {
      transaction: await prisma.vtpassTransaction.findUnique({ where: { id: tx.id } }),
      walletBalance: wallet.balance - customerPaid,
    }
  } catch (e) {
    await prisma.vtpassTransaction.update({
      where: { id: tx.id },
      data: {
        status: "FAILED",
        failureReason: e instanceof Error ? e.message : "VTpass error",
      },
    })
    await refundVtpassWallet(args.userId, wallet.id, customerPaid, requestId, tx.id)
    throw e
  }
}

async function refundVtpassWallet(
  userId: string,
  walletId: string,
  amount: number,
  reference: string,
  vtpassId: string,
) {
  await prisma.$transaction(async (db) => {
    const w = await db.moneyTransferWallet.update({
      where: { id: walletId },
      data: { balance: { increment: amount } },
    })
    await db.moneyTransferWalletTransaction.create({
      data: {
        walletId,
        userId,
        type: "CREDIT",
        amount,
        balanceAfter: w.balance,
        currency: "NGN",
        description: `Refund VTpass ${reference}`,
        reference: `${reference}-refund`,
        metadata: { vtpassTransactionId: vtpassId, refund: true },
      },
    })
  })
}
