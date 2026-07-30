import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase().slice(0, 3)
}

async function getOrCreateWalletTx(
  tx: Prisma.TransactionClient,
  userId: string,
  currency: string,
) {
  const c = normalizeCurrency(currency)
  const existing = await tx.moneyTransferWallet.findUnique({
    where: { userId_currency: { userId, currency: c } },
  })
  if (existing) return existing
  return tx.moneyTransferWallet.create({
    data: { userId, currency: c, balance: 0 },
  })
}

export async function debitWalletForAjoContribution(args: {
  userId: string
  recipientId: string
  amount: number
  currency: string
  contributionId: string
  groupId: string
  cycleId: string
  description: string
}) {
  if (args.amount <= 0) throw new Error("Contribution amount must be positive")
  const c = normalizeCurrency(args.currency)
  const reference = `AJO_DEBIT_${args.contributionId}`

  return prisma.$transaction(async (tx) => {
    const existing = await tx.moneyTransferWalletTransaction.findUnique({
      where: { reference },
    })
    if (existing) {
      const wallet = await tx.moneyTransferWallet.findUnique({
        where: { id: existing.walletId },
      })
      return {
        alreadyProcessed: true,
        walletTx: existing,
        wallet,
        newBalance: wallet?.balance ?? 0,
      }
    }

    const wallet = await getOrCreateWalletTx(tx, args.userId, c)
    if (wallet.balance < args.amount) {
      throw new Error("Insufficient wallet balance")
    }

    const newBalance = Math.round((wallet.balance - args.amount) * 100) / 100
    const transfer = await tx.moneyTransfer.create({
      data: {
        senderId: args.userId,
        receiverId: args.recipientId,
        amount: args.amount,
        currency: c,
        receiveAmount: args.amount,
        receiveCurrency: c,
        status: "COMPLETED",
        description: args.description,
        metadata: {
          source: "AJO_CONTRIBUTION",
          ajoGroupId: args.groupId,
          ajoCycleId: args.cycleId,
          ajoContributionId: args.contributionId,
        } as Prisma.InputJsonValue,
        settlementMode: "WALLET",
        sentAt: new Date(),
        completedAt: new Date(),
      },
    })
    const walletTx = await tx.moneyTransferWalletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: args.userId,
        type: "DEBIT",
        amount: args.amount,
        balanceAfter: newBalance,
        currency: c,
        description: args.description,
        reference,
        transferId: transfer.id,
        metadata: {
          ajoGroupId: args.groupId,
          ajoCycleId: args.cycleId,
          ajoContributionId: args.contributionId,
          moneyTransferId: transfer.id,
        } as Prisma.InputJsonValue,
      },
    })

    await tx.moneyTransferWallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    })

    return { alreadyProcessed: false, walletTx, wallet, newBalance }
  })
}

export async function creditWalletForAjoPayout(args: {
  senderId?: string
  userId: string
  amount: number
  currency: string
  payoutId: string
  groupId: string
  cycleId: string
  description: string
}) {
  if (args.amount <= 0) throw new Error("Payout amount must be positive")
  const c = normalizeCurrency(args.currency)
  const reference = `AJO_CREDIT_${args.payoutId}`

  return prisma.$transaction(async (tx) => {
    const existing = await tx.moneyTransferWalletTransaction.findUnique({
      where: { reference },
    })
    if (existing) {
      const wallet = await tx.moneyTransferWallet.findUnique({
        where: { id: existing.walletId },
      })
      return {
        alreadyProcessed: true,
        walletTx: existing,
        wallet,
        newBalance: wallet?.balance ?? 0,
      }
    }

    const wallet = await getOrCreateWalletTx(tx, args.userId, c)
    const newBalance = Math.round((wallet.balance + args.amount) * 100) / 100
    const transfer = await tx.moneyTransfer.create({
      data: {
        senderId: args.senderId || args.userId,
        receiverId: args.userId,
        amount: args.amount,
        currency: c,
        receiveAmount: args.amount,
        receiveCurrency: c,
        status: "COMPLETED",
        description: args.description,
        metadata: {
          source: "AJO_PAYOUT",
          ajoGroupId: args.groupId,
          ajoCycleId: args.cycleId,
          ajoPayoutId: args.payoutId,
        } as Prisma.InputJsonValue,
        settlementMode: "WALLET",
        sentAt: new Date(),
        completedAt: new Date(),
      },
    })
    const walletTx = await tx.moneyTransferWalletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: args.userId,
        type: "CREDIT",
        amount: args.amount,
        balanceAfter: newBalance,
        currency: c,
        description: args.description,
        reference,
        transferId: transfer.id,
        metadata: {
          ajoGroupId: args.groupId,
          ajoCycleId: args.cycleId,
          ajoPayoutId: args.payoutId,
          moneyTransferId: transfer.id,
        } as Prisma.InputJsonValue,
      },
    })

    await tx.moneyTransferWallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    })

    return { alreadyProcessed: false, walletTx, wallet, newBalance }
  })
}
