import { prisma } from "@/lib/prisma"
import { creditMoneyTransferWalletFromTransfer } from "@/lib/money-transfer-wallet"
import { Prisma } from "@prisma/client"

function normalizeCurrency(code: string): string {
  return code.trim().toUpperCase().slice(0, 3)
}

/**
 * Pay for a pending transfer from sender's money wallet (no card).
 * Debits sender then credits receiver per settlement mode.
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

  await prisma.$transaction(async (tx) => {
    const wallet = await tx.moneyTransferWallet.findUnique({
      where: {
        userId_currency: { userId: transfer.senderId, currency: debitCurrency },
      },
    })
    if (!wallet || wallet.balance < totalDebit) {
      throw new Error(
        `Insufficient wallet balance. Need ${debitCurrency} ${totalDebit.toFixed(2)}`,
      )
    }

    const newBalance = wallet.balance - totalDebit
    await tx.moneyTransferWallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    })

    await tx.moneyTransferWalletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: transfer.senderId,
        type: "DEBIT",
        amount: totalDebit,
        balanceAfter: newBalance,
        currency: debitCurrency,
        description: `Sent to ${transfer.receiver.name || "recipient"}`,
        reference: `MTW_DEBIT_${transfer.reference}`,
        transferId: transfer.id,
        metadata: { paymentSource: "WALLET" } as Prisma.InputJsonValue,
      },
    })

    await tx.moneyTransfer.update({
      where: { id: transfer.id },
      data: {
        status: "PROCESSING",
        sentAt: new Date(),
        metadata: {
          ...meta,
          paymentSource: "WALLET",
          paidFromWallet: true,
        } as Prisma.InputJsonValue,
      },
    })
  })

  await creditMoneyTransferWalletFromTransfer(transferId)

  return prisma.moneyTransfer.findUnique({ where: { id: transferId } })
}
