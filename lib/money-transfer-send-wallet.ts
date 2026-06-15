import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { settleMoneyTransferAfterPayment } from "@/lib/money-transfer-settlement"
import { debitMoneyTransferWalletComposite } from "@/lib/money-transfer-wallet"

function normalizeCurrency(code: string): string {
  return code.trim().toUpperCase().slice(0, 3)
}

/**
 * Pay for a pending transfer from sender's money wallet (no card).
 * Debits sender across all wallet currencies then settles per delivery mode.
 */
export async function completeMoneyTransferFromWallet(transferId: string) {
  const transfer = await prisma.moneyTransfer.findUnique({
    where: { id: transferId },
    include: {
      sender: { select: { id: true, name: true, email: true, phone: true } },
      receiver: { select: { id: true, name: true } },
    },
  })

  if (!transfer) throw new Error("Transfer not found")
  if (transfer.status !== "PENDING") {
    throw new Error("Transfer is no longer pending")
  }

  const meta = (transfer.metadata as Record<string, unknown>) || {}
  const totalDebit = Number(meta.totalAmount ?? transfer.amount)
  const debitCurrency = normalizeCurrency(transfer.currency)

  await debitMoneyTransferWalletComposite({
    userId: transfer.senderId,
    amountNeeded: totalDebit,
    targetCurrency: debitCurrency,
    transferId: transfer.id,
    description: `Sent to ${transfer.receiver.name || "recipient"}`,
    referencePrefix: "MTW_DEBIT",
  })

  await prisma.moneyTransfer.update({
    where: { id: transfer.id },
    data: {
      status: "PROCESSING",
      sentAt: new Date(),
      metadata: {
        ...meta,
        paymentSource: "WALLET",
        paidFromWallet: true,
        compositeWalletDebit: true,
      } as Prisma.InputJsonValue,
    },
  })

  await settleMoneyTransferAfterPayment(transferId)

  return prisma.moneyTransfer.findUnique({ where: { id: transferId } })
}
