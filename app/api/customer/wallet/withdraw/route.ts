import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { amount, currency = 'USD', bankAccountId } = await request.json()

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    // Fetch wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId: session.id },
    })

    if (!wallet || wallet.balance < amount) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
    }

    // Run everything atomically
    const [updatedWallet, withdrawal, walletTransaction] = await prisma.$transaction([
      // 1. Update wallet balance
      prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: amount },
        },
      }),

      // 2. Create withdrawal transaction
      prisma.transaction.create({
        data: {
          userId: session.id,
          walletId: wallet.id,
          type: 'WALLET_DEDUCTION',
          amount: -amount,
          currency,
          status: 'PENDING',
          description: `Withdrawal of ${currency} ${amount}`,
          metadata: {
            type: 'WITHDRAWAL',
            bankAccountId,
          },
        },
      }),

      // 3. Log wallet transaction
      prisma.walletTransaction.create({
        data: {
          userId: session.id,
          type: 'DEBIT',
          amount: amount,
          balance: wallet.balance - amount,
          description: `Withdrawal of ${currency} ${amount}`,
          reference: `WITHDRAW_${Date.now()}`,
          metadata: {
            type: 'WITHDRAWAL',
            bankAccountId,
          },
          status: 'PENDING',
        },
      }),
    ])



    return NextResponse.json({
      success: true,
      data: {
        transactionId: withdrawal.id,
        amount,
        currency,
        status: 'PENDING',
        transaction: withdrawal,
        walletTransaction,
        updatedWallet,
      },
    })
  } catch (error) {
    console.error('Error processing withdrawal:', error)
    return NextResponse.json({ error: 'Failed to process withdrawal' }, { status: 500 })
  }
}
