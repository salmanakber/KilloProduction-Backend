import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getSystemDefaultCurrency } from "@/lib/money-transfer-wallet"
import { NotificationBridge } from "@/lib/notification-bridge"

function roundMoney(n: number) {
  return Math.round(n * 100) / 100
}

async function getOrCreateWallet(tx: Prisma.TransactionClient, userId: string, currency: string) {
  const c = currency.toUpperCase().slice(0, 3)
  const existing = await tx.moneyTransferWallet.findUnique({
    where: { userId_currency: { userId, currency: c } },
  })
  if (existing) return existing
  return tx.moneyTransferWallet.create({
    data: { userId, currency: c, balance: 0 },
  })
}

/** Build Empower / Trust score from Ajo reputation + wallet activity. */
export async function computeCreditScore(userId: string) {
  const memberships = await prisma.ajoGroupMember.findMany({
    where: { userId, status: "ACTIVE" },
    select: { reputationScore: true },
  })
  const avgAjo =
    memberships.length > 0
      ? memberships.reduce((s, m) => s + (m.reputationScore ?? 100), 0) / memberships.length
      : 60

  const paidCount = await prisma.ajoContribution.count({
    where: { userId, status: "PAID" },
  })
  const failedCount = await prisma.ajoContribution.count({
    where: { userId, status: { in: ["FAILED", "WAIVED"] } },
  })
  const walletTxCount = await prisma.moneyTransferWalletTransaction.count({
    where: { userId },
  })

  // Weighted score 0–100
  let score = avgAjo * 0.55
  score += Math.min(25, paidCount * 2)
  score += Math.min(15, walletTxCount * 0.5)
  score -= Math.min(30, failedCount * 5)
  score = Math.max(0, Math.min(100, Math.round(score)))

  const tier =
    score >= 90 ? "DIAMOND" : score >= 75 ? "PLATINUM" : score >= 60 ? "GOLD" : score >= 40 ? "SILVER" : "BRONZE"

  return {
    score,
    tier,
    signals: {
      ajoReputationAvg: Math.round(avgAjo),
      ajoPaidCount: paidCount,
      ajoFailedCount: failedCount,
      walletActivity: walletTxCount,
    },
  }
}

function offerFromScore(score: number, currency: string) {
  // Soft limits — not a bank product; scales with behaviour
  let maxAmount = 5000
  let interestRate = 0.08
  let termDays = 14
  if (score >= 90) {
    maxAmount = 100000
    interestRate = 0.03
    termDays = 60
  } else if (score >= 75) {
    maxAmount = 50000
    interestRate = 0.04
    termDays = 45
  } else if (score >= 60) {
    maxAmount = 25000
    interestRate = 0.05
    termDays = 30
  } else if (score >= 40) {
    maxAmount = 10000
    interestRate = 0.06
    termDays = 21
  }

  return { maxAmount, interestRate, termDays, currency }
}

export async function getCreditCentre(userId: string) {
  const currency = await getSystemDefaultCurrency()
  const scoreInfo = await computeCreditScore(userId)

  let offer = await prisma.creditOffer.findFirst({
    where: {
      userId,
      status: "OFFERED",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  })

  if (!offer && scoreInfo.score >= 40) {
    const built = offerFromScore(scoreInfo.score, currency)
    offer = await prisma.creditOffer.create({
      data: {
        userId,
        currency: built.currency,
        maxAmount: built.maxAmount,
        interestRate: built.interestRate,
        termDays: built.termDays,
        status: "OFFERED",
        scoreSnapshot: scoreInfo.score,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        metadata: { tier: scoreInfo.tier, signals: scoreInfo.signals } as Prisma.InputJsonValue,
      },
    })
  }

  const activeLoans = await prisma.creditLoan.findMany({
    where: {
      userId,
      status: { in: ["DISBURSED", "REPAYING", "PENDING"] },
    },
    orderBy: { createdAt: "desc" },
  })

  const history = await prisma.creditLoan.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  return {
    score: scoreInfo,
    offer: offer
      ? {
          id: offer.id,
          maxAmount: offer.maxAmount,
          currency: offer.currency,
          interestRate: offer.interestRate,
          termDays: offer.termDays,
          expiresAt: offer.expiresAt?.toISOString() ?? null,
          scoreSnapshot: offer.scoreSnapshot,
        }
      : null,
    activeLoans: activeLoans.map(serializeLoan),
    history: history.map(serializeLoan),
  }
}

export async function acceptCreditOffer(args: {
  userId: string
  offerId: string
  amount: number
}) {
  const offer = await prisma.creditOffer.findFirst({
    where: { id: args.offerId, userId: args.userId, status: "OFFERED" },
  })
  if (!offer) throw new Error("Offer not found or no longer available")
  if (offer.expiresAt && offer.expiresAt.getTime() < Date.now()) {
    await prisma.creditOffer.update({ where: { id: offer.id }, data: { status: "EXPIRED" } })
    throw new Error("This offer has expired")
  }

  const amount = roundMoney(args.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount")
  if (amount > offer.maxAmount) throw new Error(`Maximum available is ${offer.maxAmount}`)

  const interestAmount = roundMoney(amount * offer.interestRate)
  const totalDue = roundMoney(amount + interestAmount)
  const dueAt = new Date(Date.now() + offer.termDays * 24 * 60 * 60 * 1000)
  const reference = `CREDIT_DISBURSE_${offer.id}_${Date.now()}`

  const result = await prisma.$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(tx, args.userId, offer.currency)
    const newBalance = roundMoney(wallet.balance + amount)
    const walletTx = await tx.moneyTransferWalletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: args.userId,
        type: "CREDIT",
        amount,
        balanceAfter: newBalance,
        currency: offer.currency,
        description: "Credit Centre disbursement",
        reference,
        metadata: {
          source: "CREDIT_DISBURSE",
          offerId: offer.id,
        } as Prisma.InputJsonValue,
      },
    })
    await tx.moneyTransferWallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    })

    const loan = await tx.creditLoan.create({
      data: {
        offerId: offer.id,
        userId: args.userId,
        principal: amount,
        currency: offer.currency,
        interestAmount,
        totalDue,
        amountRepaid: 0,
        status: "DISBURSED",
        disbursedAt: new Date(),
        dueAt,
        disburseWalletTxId: walletTx.id,
      },
    })

    await tx.creditOffer.update({
      where: { id: offer.id },
      data: { status: "ACCEPTED" },
    })

    return { loan, walletTx }
  })

  try {
    await NotificationBridge.sendNotification({
      userId: args.userId,
      title: "Credit disbursed",
      message: `${offer.currency} ${amount.toLocaleString()} is now in your wallet. Repay by ${dueAt.toLocaleDateString()}.`,
      type: "SYSTEM",
      module: "MONEY_TRANSFER",
      data: {
        type: "credit_disbursed",
        actionType: "navigate",
        screen: "CreditCentre",
      },
    })
  } catch {
    /* ignore */
  }

  return { success: true, loan: serializeLoan(result.loan) }
}

export async function repayCreditLoan(args: {
  userId: string
  loanId: string
  amount?: number
}) {
  const loan = await prisma.creditLoan.findFirst({
    where: { id: args.loanId, userId: args.userId },
  })
  if (!loan) throw new Error("Loan not found")
  if (!["DISBURSED", "REPAYING"].includes(loan.status)) {
    throw new Error("This loan cannot be repaid")
  }

  const remaining = roundMoney(loan.totalDue - loan.amountRepaid)
  if (remaining <= 0) throw new Error("Loan is already paid off")

  const payAmount = roundMoney(args.amount && args.amount > 0 ? Math.min(args.amount, remaining) : remaining)
  const reference = `CREDIT_REPAY_${loan.id}_${Date.now()}`

  await prisma.$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(tx, args.userId, loan.currency)
    if (wallet.balance < payAmount) {
      throw new Error("Insufficient wallet balance")
    }
    const newBalance = roundMoney(wallet.balance - payAmount)
    await tx.moneyTransferWalletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: args.userId,
        type: "DEBIT",
        amount: payAmount,
        balanceAfter: newBalance,
        currency: loan.currency,
        description: "Credit Centre repayment",
        reference,
        metadata: {
          source: "CREDIT_REPAY",
          loanId: loan.id,
        } as Prisma.InputJsonValue,
      },
    })
    await tx.moneyTransferWallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    })

    const newRepaid = roundMoney(loan.amountRepaid + payAmount)
    const paidOff = newRepaid >= loan.totalDue - 0.001
    await tx.creditLoan.update({
      where: { id: loan.id },
      data: {
        amountRepaid: newRepaid,
        status: paidOff ? "PAID_OFF" : "REPAYING",
      },
    })
  })

  const updated = await prisma.creditLoan.findUnique({ where: { id: loan.id } })
  return { success: true, loan: serializeLoan(updated!) }
}

function serializeLoan(loan: {
  id: string
  principal: number
  currency: string
  interestAmount: number
  totalDue: number
  amountRepaid: number
  status: string
  disbursedAt: Date | null
  dueAt: Date | null
  createdAt: Date
}) {
  return {
    id: loan.id,
    principal: loan.principal,
    currency: loan.currency,
    interestAmount: loan.interestAmount,
    totalDue: loan.totalDue,
    amountRepaid: loan.amountRepaid,
    remaining: roundMoney(loan.totalDue - loan.amountRepaid),
    status: loan.status,
    disbursedAt: loan.disbursedAt?.toISOString() ?? null,
    dueAt: loan.dueAt?.toISOString() ?? null,
    createdAt: loan.createdAt.toISOString(),
  }
}
