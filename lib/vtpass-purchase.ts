import { prisma } from "@/lib/prisma"
import { getOrCreateMoneyTransferWallet } from "@/lib/money-transfer-wallet"
import {
  computeVtpassCommission,
  executeVtpassPayment,
  generateVtpassRequestId,
  getVtpassConfig,
  normalizeVtpassPhone,
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
  extraFields?: Record<string, string>
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

  const billersCode =
    args.serviceType === "airtime" || args.serviceType === "data"
      ? normalizeVtpassPhone(args.billersCode)
      : args.billersCode.trim()
  const phone = args.phone ? normalizeVtpassPhone(args.phone) : undefined

  const commission = computeVtpassCommission(amount, args.serviceType, config)
  const customerPaid = Math.round((amount + commission) * 100) / 100

  const wallet = await getOrCreateMoneyTransferWallet(args.userId, "NGN")
  if (wallet.balance < customerPaid) {
    throw new Error(
      `Insufficient NGN wallet balance. Need ₦${customerPaid.toFixed(2)}, available ₦${wallet.balance.toFixed(2)}`,
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
      billersCode,
      phone: phone || (args.serviceType === "airtime" ? billersCode : args.phone),
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

  let refunded = false

  try {
    const result = await executeVtpassPayment({
      serviceId: args.serviceId,
      serviceType: args.serviceType,
      billersCode,
      amount,
      phone: phone || billersCode,
      variationCode: args.variationCode,
      requestId,
      extraFields: args.extraFields,
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
      refunded = true
      throw new Error(result.message || "Payment failed. Wallet refunded.")
    }

    const updatedWallet = await getOrCreateMoneyTransferWallet(args.userId, "NGN")

    try {
      const { NotificationBridge } = await import("@/lib/notification-bridge")
      const label = args.serviceType.replace(/_/g, " ")
      await NotificationBridge.sendNotification({
        userId: args.userId,
        title: "Bill payment successful",
        message: `Your ${label} payment (${args.serviceId}) of ₦${customerPaid.toFixed(2)} was delivered.`,
        type: "SYSTEM",
        module: "MONEY_TRANSFER",
        data: {
          actionType: "navigate",
          screen: "AccountStatement",
          params: [],
          vtpassTransactionId: tx.id,
          serviceType: args.serviceType,
          serviceId: args.serviceId,
          amount: customerPaid,
        },
        actionUrl: "/money-app/statement",
      })
    } catch (notifyErr) {
      console.error("Vtpass success notification failed:", notifyErr)
    }

    return {
      transaction: await prisma.vtpassTransaction.findUnique({ where: { id: tx.id } }),
      walletBalance: updatedWallet.balance,
    }
  } catch (e) {
    if (!refunded) {
      await prisma.vtpassTransaction.updateMany({
        where: { id: tx.id, status: "PROCESSING" },
        data: {
          status: "FAILED",
          failureReason: e instanceof Error ? e.message : "VTpass error",
        },
      })
      await refundVtpassWallet(args.userId, wallet.id, customerPaid, requestId, tx.id)
    }
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
  const refundRef = `${reference}-refund`
  const existing = await prisma.moneyTransferWalletTransaction.findUnique({
    where: { reference: refundRef },
  })
  if (existing) return

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
        reference: refundRef,
        metadata: { vtpassTransactionId: vtpassId, refund: true },
      },
    })
  })

  await prisma.vtpassTransaction.updateMany({
    where: { id: vtpassId, status: { in: ["PROCESSING", "FAILED"] } },
    data: { status: "REVERSED" },
  })
}
