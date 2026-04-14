import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { createPaymentIntent } from '@/lib/payment-gateway'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {

    const session = await authenticateRequest(request)
    if (!session?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { amount, currency, gateway, orderId, description, customerEmail, metadata } = body

    // Validate required fields
    if (!amount || !currency || !gateway || !orderId || !description || !customerEmail) {
      return NextResponse.json({ 
        error: 'Missing required fields: amount, currency, gateway, orderId, description, customerEmail' 
      }, { status: 400 })
    }

    let mergedMeta: Record<string, unknown> = {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      userId: session.id,
      createdAt: new Date().toISOString(),
      orderId,
    }

    const existingPayment = await prisma.payment.findFirst({
      where: { id: orderId, userId: session.id },
    })

    if (existingPayment) {
      const prev = (existingPayment.metadata as Record<string, unknown> | null) || {}
      mergedMeta = {
        ...prev,
        ...mergedMeta,
        paymentProcessingFee: prev.paymentProcessingFee ?? mergedMeta.paymentProcessingFee,
        paymentProcessingRate: prev.paymentProcessingRate ?? mergedMeta.paymentProcessingRate,
        baseAmount: prev.baseAmount ?? mergedMeta.baseAmount,
        module: prev.module ?? mergedMeta.module,
      }
      const expected = existingPayment.amount
      if (Math.abs(Number(amount) - expected) > 0.02) {
        return NextResponse.json(
          { error: 'Amount does not match pending payment record' },
          { status: 400 }
        )
      }
      if (existingPayment.currency.toUpperCase() !== String(currency).toUpperCase()) {
        return NextResponse.json({ error: 'Currency does not match pending payment record' }, { status: 400 })
      }

      await prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          gateway,
          metadata: mergedMeta as object,
        },
      })
    }

    // Create payment intent using the payment gateway service
    const paymentIntent = await createPaymentIntent({
      amount,
      currency,
      gateway,
      orderId,
      description,
      customerEmail,
      metadata: mergedMeta,
    })

    return NextResponse.json({
      success: true,
      data: paymentIntent
    })

  } catch (error: any) {
    console.error('Payment intent creation error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to create payment intent'
    }, { status: 500 })
  }
}
