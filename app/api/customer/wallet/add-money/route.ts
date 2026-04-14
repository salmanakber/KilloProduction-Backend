import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { CommissionType, type Module } from '@prisma/client'
import { calculateCommission, tryCalculateCommissionAmount } from '@/lib/commission-service'
import { completeWalletTopUp } from '@/lib/wallet-topup-complete'

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { amount, currency = 'USD', paymentMethodId, gateway = 'STRIPE' } = await request.json()

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const module: Module = 'WALLET'
    const baseAmount = Number(amount)
    const processingFee = await tryCalculateCommissionAmount(
      module,
      baseAmount,
      CommissionType.PAYMENT_PROCESSING
    )
    let processingRate = 0
    if (processingFee > 0) {
      try {
        const calc = await calculateCommission(module, baseAmount, CommissionType.PAYMENT_PROCESSING)
        processingRate = calc.commissionRate
      } catch {
        processingRate = 0
      }
    }
    const totalCharge = Math.round((baseAmount + processingFee) * 100) / 100

    let wallet = await prisma.wallet.findUnique({
      where: { userId: session.id }
    })

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId: session.id,
          balance: 0,
          currency
        }
      })
    }

    const paymentIntent = await prisma.payment.create({
      data: {
        userId: session.id,
        amount: totalCharge,
        currency,
        status: 'PENDING',
        gateway: gateway || 'STRIPE',
        paymentMethodId,
        description: `Wallet top-up of ${currency} ${baseAmount}`,
        metadata: {
          type: 'WALLET_TOPUP',
          userId: session.id,
          walletId: wallet.id,
          baseAmount,
          paymentProcessingFee: processingFee,
          paymentProcessingRate: processingRate,
          module,
          totalCharged: totalCharge,
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        paymentIntentId: paymentIntent.id,
        amount: baseAmount,
        totalCharge,
        processingFee,
        currency,
        gateway,
        walletId: wallet.id
      }
    })
  } catch (error) {
    console.error('Error creating wallet top-up:', error)
    return NextResponse.json({ error: 'Failed to create wallet top-up' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { paymentIntentId } = await request.json()

    if (!paymentIntentId) {
      return NextResponse.json({ error: 'Missing paymentIntentId' }, { status: 400 })
    }

    const result = await completeWalletTopUp(paymentIntentId, session.id)
    if (!result) {
      return NextResponse.json({ error: 'Payment not found or invalid' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        wallet: result.wallet,
        transaction: result.transaction
      }
    })
  } catch (error) {
    console.error('Error processing wallet top-up:', error)
    return NextResponse.json({ error: 'Failed to process wallet top-up' }, { status: 500 })
  }
}
