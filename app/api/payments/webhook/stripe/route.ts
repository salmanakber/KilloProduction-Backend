import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPaymentGatewayConfig } from '@/lib/payment-gateway'
import { completeWalletTopUp } from '@/lib/wallet-topup-complete'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json({ error: 'No signature provided' }, { status: 400 })
    }

    const config = await getPaymentGatewayConfig()
    const stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2023-10-16',
    })

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        config.stripe.webhookSecret || ''
      )
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent)
        break
      case 'payment_method.attached':
        await handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod)
        break
      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  try {
    console.log('Payment succeeded:', paymentIntent.id)

    const prismaPaymentId =
      typeof paymentIntent.metadata?.orderId === 'string'
        ? paymentIntent.metadata.orderId
        : null

    if (prismaPaymentId) {
      const existing = await prisma.payment.findFirst({
        where: { id: prismaPaymentId },
      })
      if (existing) {
        const prevMeta = (existing.metadata as Record<string, unknown> | null) || {}
        await prisma.payment.update({
          where: { id: prismaPaymentId },
          data: {
            status: 'PAID',
            gatewayTransactionId: paymentIntent.id,
            gatewayResponse: paymentIntent as unknown as object,
            metadata: {
              ...prevMeta,
              stripePaymentIntentId: paymentIntent.id,
              stripePaymentStatus: paymentIntent.status,
            },
          },
        })
      }
    }

    if (paymentIntent.metadata?.type === 'WALLET_TOPUP') {
      const userId =
        typeof paymentIntent.metadata.userId === 'string'
          ? paymentIntent.metadata.userId
          : null
      if (userId && prismaPaymentId) {
        await completeWalletTopUp(prismaPaymentId, userId)
      }
    }
  } catch (error) {
    console.error('Error handling payment intent succeeded:', error)
  }
}

async function handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod) {
  try {
    console.log('Payment method attached:', paymentMethod.id)

    const customerId = paymentMethod.customer as string
    if (!customerId) return

    const config = await getPaymentGatewayConfig()
    const stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2023-10-16',
    })

    const paymentIntents = await stripe.paymentIntents.list({
      customer: customerId,
      limit: 1,
    })

    if (paymentIntents.data.length === 0) {
      console.log('No payment intents found for customer:', customerId)
      return
    }

    const paymentIntent = paymentIntents.data[0]
    const userId = paymentIntent.metadata?.userId

    if (!userId) {
      console.log('No userId found in payment intent metadata')
      return
    }

    await prisma.paymentMethod.create({
      data: {
        userId: userId,
        gatewayPaymentMethodId: paymentMethod.id,
        type: paymentMethod.type === 'card' ? 'CARD' : 'BANK',
        last4: paymentMethod.card?.last4,
        brand: paymentMethod.card?.brand,
        expiryMonth: paymentMethod.card?.exp_month,
        expiryYear: paymentMethod.card?.exp_year,
        isDefault: false,
        provider: 'STRIPE',
        token: paymentMethod.card?.brand || '',
      },
    })

    const existingMethods = await prisma.paymentMethod.count({
      where: { userId: userId },
    })

    if (existingMethods === 1) {
      await prisma.paymentMethod.updateMany({
        where: { userId: userId },
        data: { isDefault: true },
      })
    }

    console.log('Payment method saved successfully for user:', userId)
  } catch (error) {
    console.error('Error handling payment method attached:', error)
  }
}
