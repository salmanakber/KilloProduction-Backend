import { NotificationBridge } from "@/lib/notification-bridge"

type TransferParty = {
  id: string
  name?: string | null
  email?: string | null
}

type TransferNotifyContext = {
  transferId: string
  reference?: string
  amount: number
  currency: string
  receiveAmount?: number | null
  receiveCurrency?: string | null
  sender: TransferParty
  receiver: TransferParty
}

function transferDeepLink(transferId: string) {
  return {
    actionUrl: `/money-app/transactions/${transferId}`,
    data: {
      actionType: "navigate",
      screen: "TransactionStatus",
      params: [{ name: "transactionId", value: transferId }],
    },
  }
}

function fmtAmount(amount: number, currency: string) {
  const sym = currency === "NGN" ? "₦" : currency === "USD" ? "$" : `${currency} `
  return `${sym}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function partyName(p: TransferParty) {
  return p.name || p.email || "User"
}

/** Sender: payment went through / money sent */
export async function notifyMoneyTransferSent(ctx: TransferNotifyContext) {
  const amountText = fmtAmount(ctx.amount, ctx.currency)
  const link = transferDeepLink(ctx.transferId)

  await NotificationBridge.sendNotification({
    userId: ctx.sender.id,
    title: "Payment sent",
    message: `Your payment of ${amountText} to ${partyName(ctx.receiver)} was sent successfully.`,
    type: "SYSTEM",
    module: "MONEY_TRANSFER",
    ...link,
  })

  const receiveText =
    ctx.receiveAmount != null && ctx.receiveCurrency
      ? fmtAmount(ctx.receiveAmount, ctx.receiveCurrency)
      : amountText

  await NotificationBridge.sendNotification({
    userId: ctx.receiver.id,
    title: "Money received",
    message: `${partyName(ctx.sender)} sent you ${receiveText}.`,
    type: "SYSTEM",
    module: "MONEY_TRANSFER",
    ...link,
  })
}

/** Transfer cancelled (admin or system) */
export async function notifyMoneyTransferCancelled(ctx: TransferNotifyContext, reason?: string) {
  const amountText = fmtAmount(ctx.amount, ctx.currency)
  const link = transferDeepLink(ctx.transferId)
  const detail = reason ? ` Reason: ${reason}` : ""

  await NotificationBridge.sendNotification({
    userId: ctx.sender.id,
    title: "Transfer cancelled",
    message: `Your transfer of ${amountText} to ${partyName(ctx.receiver)} was cancelled.${detail}`,
    type: "SYSTEM",
    module: "MONEY_TRANSFER",
    ...link,
  })

  await NotificationBridge.sendNotification({
    userId: ctx.receiver.id,
    title: "Incoming transfer cancelled",
    message: `A transfer of ${amountText} from ${partyName(ctx.sender)} was cancelled.${detail}`,
    type: "SYSTEM",
    module: "MONEY_TRANSFER",
    ...link,
  })
}

/** Transfer or payout failed */
export async function notifyMoneyTransferFailed(ctx: TransferNotifyContext, reason?: string) {
  const amountText = fmtAmount(ctx.amount, ctx.currency)
  const link = transferDeepLink(ctx.transferId)
  const detail = reason ? ` ${reason}` : ""

  await NotificationBridge.sendNotification({
    userId: ctx.sender.id,
    title: "Transfer failed",
    message: `Your transfer of ${amountText} to ${partyName(ctx.receiver)} could not be completed.${detail}`,
    type: "SYSTEM",
    module: "MONEY_TRANSFER",
    ...link,
  })

  await NotificationBridge.sendNotification({
    userId: ctx.receiver.id,
    title: "Incoming transfer failed",
    message: `A transfer of ${amountText} from ${partyName(ctx.sender)} did not complete.${detail}`,
    type: "SYSTEM",
    module: "MONEY_TRANSFER",
    ...link,
  })
}

/** Transfer completed (wallet credit or bank deposit finished) */
export async function notifyMoneyTransferCompleted(ctx: TransferNotifyContext, bankDetail?: string) {
  const amountText = fmtAmount(ctx.amount, ctx.currency)
  const link = transferDeepLink(ctx.transferId)
  const bankNote = bankDetail ? ` ${bankDetail}` : ""

  await NotificationBridge.sendNotification({
    userId: ctx.sender.id,
    title: "Transfer completed",
    message: `Your transfer of ${amountText} to ${partyName(ctx.receiver)} has been completed.${bankNote}`,
    type: "SYSTEM",
    module: "MONEY_TRANSFER",
    ...link,
  })

  const receiveText =
    ctx.receiveAmount != null && ctx.receiveCurrency
      ? fmtAmount(ctx.receiveAmount, ctx.receiveCurrency)
      : amountText

  await NotificationBridge.sendNotification({
    userId: ctx.receiver.id,
    title: "Money delivered",
    message: `You received ${receiveText} from ${partyName(ctx.sender)}.${bankNote}`,
    type: "SYSTEM",
    module: "MONEY_TRANSFER",
    ...link,
  })
}

/** Bank payout submitted to Paystack — processing */
export async function notifyMoneyBankPayoutProcessing(
  ctx: TransferNotifyContext,
  ngnAmount: number,
  bankName: string,
) {
  const link = transferDeepLink(ctx.transferId)
  const ngnText = fmtAmount(ngnAmount, "NGN")

  await NotificationBridge.sendNotification({
    userId: ctx.sender.id,
    title: "Bank deposit processing",
    message: `Your payment was received. We're depositing ${ngnText} to ${partyName(ctx.receiver)}'s bank (${bankName}).`,
    type: "SYSTEM",
    module: "MONEY_TRANSFER",
    ...link,
  })

  await NotificationBridge.sendNotification({
    userId: ctx.receiver.id,
    title: "Bank deposit on its way",
    message: `${partyName(ctx.sender)} sent you money. ${ngnText} is being deposited to your ${bankName} account.`,
    type: "SYSTEM",
    module: "MONEY_TRANSFER",
    ...link,
  })
}

/** Bank payout completed */
export async function notifyMoneyBankPayoutCompleted(
  ctx: TransferNotifyContext,
  ngnAmount: number,
  bankName: string,
  accountTail?: string,
) {
  const link = transferDeepLink(ctx.transferId)
  const ngnText = fmtAmount(ngnAmount, "NGN")
  const tail = accountTail ? ` ending ${accountTail}` : ""

  await NotificationBridge.sendNotification({
    userId: ctx.sender.id,
    title: "Bank deposit completed",
    message: `Your transfer to ${partyName(ctx.receiver)}'s bank has been completed (${ngnText} to ${bankName}).`,
    type: "SYSTEM",
    module: "MONEY_TRANSFER",
    ...link,
  })

  await NotificationBridge.sendNotification({
    userId: ctx.receiver.id,
    title: "Bank deposit completed",
    message: `${ngnText} has been deposited to your ${bankName} account${tail}.`,
    type: "SYSTEM",
    module: "MONEY_TRANSFER",
    ...link,
  })
}

export async function loadTransferNotifyContext(transferId: string): Promise<TransferNotifyContext | null> {
  const { prisma } = await import("@/lib/prisma")
  const t = await prisma.moneyTransfer.findUnique({
    where: { id: transferId },
    select: {
      id: true,
      reference: true,
      amount: true,
      currency: true,
      receiveAmount: true,
      receiveCurrency: true,
      sender: { select: { id: true, name: true, email: true } },
      receiver: { select: { id: true, name: true, email: true } },
    },
  })
  if (!t) return null
  return {
    transferId: t.id,
    reference: t.reference,
    amount: t.amount,
    currency: t.currency,
    receiveAmount: t.receiveAmount,
    receiveCurrency: t.receiveCurrency,
    sender: t.sender,
    receiver: t.receiver,
  }
}
