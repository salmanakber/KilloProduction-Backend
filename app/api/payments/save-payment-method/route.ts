import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { paymentIntentId, saveAsDefault = false } = await request.json()

    if (!paymentIntentId) {
      return NextResponse.json({ error: 'Payment intent ID is required' }, { status: 400 })
    }

    // Initialize Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2023-10-16',
    })

    // Get the payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (!paymentIntent.payment_method) {
      return NextResponse.json({ error: 'No payment method found' }, { status: 400 })
    }

    // Get the payment method details
    const paymentMethod = await stripe.paymentMethods.retrieve(
      paymentIntent.payment_method as string
    )

    // Check if payment method already exists
    const existingMethod = await prisma.paymentMethod.findFirst({
      where: {
        gatewayPaymentMethodId: paymentMethod.id
      }
    })

    if (existingMethod) {
      return NextResponse.json({ 
        success: true, 
        message: 'Payment method already saved',
        data: existingMethod 
      })
    }

    console.log('paymentMethod', paymentMethod)
    // Save payment method to database
    const savedMethod = await prisma.paymentMethod.create({
      data: {
        userId: session.id,
        gatewayPaymentMethodId: paymentMethod.id,
        type: paymentMethod.type === 'card' ? 'CARD' : 'BANK',
        last4: paymentMethod.card?.last4,
        brand: paymentMethod.card?.brand,
        expiryMonth: paymentMethod.card?.exp_month,
        expiryYear: paymentMethod.card?.exp_year,
        isDefault: saveAsDefault,
        provider: paymentMethod.card?.brand || '',
        token: paymentMethod.card?.brand || '',
      }
    })

    // If this is the first payment method or saveAsDefault is true, set it as default
    if (saveAsDefault) {
      // Remove default from other methods
      await prisma.paymentMethod.updateMany({
        where: { 
          userId: session.id,
          id: { not: savedMethod.id }
        },
        data: { isDefault: false }
      })

      // Set this method as default
      await prisma.paymentMethod.update({
        where: { id: savedMethod.id },
        data: { isDefault: true }
      })
    } else {
      // If this is the first payment method, set it as default
      const methodCount = await prisma.paymentMethod.count({
        where: { userId: session.id }
      })

      if (methodCount === 1) {
        await prisma.paymentMethod.update({
          where: { id: savedMethod.id },
          data: { isDefault: true }
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payment method saved successfully',
      data: savedMethod
    })

  } catch (error: any) {
    console.error('Error saving payment method:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to save payment method' 
    }, { status: 500 })
  }
}
