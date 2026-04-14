import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from "@/lib/auth"
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'
import { CommissionType, type Module } from '@prisma/client'
import { calculateCommission, tryCalculateCommissionAmount } from '@/lib/commission-service'
import { recordPaymentProcessingLedgerIfApplicable } from '@/lib/payment-processing-ledger'

export async function POST(request: NextRequest) {
  try {

    const session = await authenticateRequest(request)
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { 
      paymentMethodId, 
      amount, 
      currency, 
      description, 
      orderId, 
      gateway,
      module: moduleRaw,
      loyaltyPointsRedeemed,
      /** Same base used for /customer/cart/commission-flags (order subtotal before processing fee). */
      commissionBaseAmount,
    } = body

    // Validate required fields
    if (!paymentMethodId || !amount || !currency || !gateway) {
      return NextResponse.json({ 
        
        error: 'Missing required fields: paymentMethodId, amount, currency, gateway' 
      }, { status: 400 })
    }

    const module = typeof moduleRaw === 'string' ? (moduleRaw as Module) : null

    // Get the saved payment method
    const paymentMethod = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        userId: session.id,
        isActive: true
      }
    })
    

    if (!paymentMethod) {
      return NextResponse.json({ 
        error: 'Payment method not found or inactive' 
      }, { status: 404 })
    }

    let processingFee = 0
    let processingRate = 0
    if (module && commissionBaseAmount != null && Number(commissionBaseAmount) > 0) {
      processingFee = await tryCalculateCommissionAmount(
        module,
        Number(commissionBaseAmount),
        CommissionType.PAYMENT_PROCESSING
      )
      if (processingFee > 0) {
        try {
          const calc = await calculateCommission(
            module,
            Number(commissionBaseAmount),
            CommissionType.PAYMENT_PROCESSING
          )
          processingRate = calc.commissionRate
        } catch {
          processingRate = 0
        }
      }
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId: session.id,
        amount,
        currency,
        status: 'PENDING',
        gateway,
        paymentMethodId: paymentMethod.id,
        orderId,
        description,
        metadata: {
          gatewayPaymentMethodId: paymentMethod.gatewayPaymentMethodId,
          last4: paymentMethod.last4,
          brand: paymentMethod.brand,
          loyaltyPointsRedeemed: loyaltyPointsRedeemed ?? 0,
          module: module ?? undefined,
          commissionBaseAmount: commissionBaseAmount ?? undefined,
          paymentProcessingFee: processingFee,
          paymentProcessingRate: processingRate,
        }
      }
    })

    // Process payment based on gateway
    let paymentResult
    try {
      if (gateway === 'STRIPE') {
        paymentResult = await processStripePayment(paymentMethod.gatewayPaymentMethodId, amount, currency, description)
      } else if (gateway === 'PAYSTACK') {
        paymentResult = await processPaystackPayment(paymentMethod.gatewayPaymentMethodId, amount, currency, description)
      } else {
        throw new Error(`Unsupported gateway: ${gateway}`)
      }
      // Update payment status
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: paymentResult.success ? 'PAID' : 'FAILED',
          gatewayTransactionId: paymentResult.transactionId,
          gatewayResponse: paymentResult.response
        }
      })

      if (paymentResult.success && module && processingFee > 0) {
        await recordPaymentProcessingLedgerIfApplicable({
          paymentId: payment.id,
          userId: session.id,
          module,
          orderAmount: Number(commissionBaseAmount),
          feeAmount: processingFee,
          ratePercent: processingRate,
          currency,
          gateway,
        })
      }

      return NextResponse.json({
        success: paymentResult.success,
        data: {
          paymentId: payment.id,
          status: paymentResult.success ? 'PAID' : 'FAILED',
          transactionId: paymentResult.transactionId,
          amount,
          currency
        },
        message: paymentResult.success ? 'Payment processed successfully' : paymentResult.message
      })

    } catch (paymentError: any) {
      // Update payment status to failed
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          gatewayResponse: { error: paymentError.message }
        }
      })
        console.log('paymentError', paymentError)

      return NextResponse.json({
        success: false,
        error: paymentError.message || 'Payment processing failed'
      }, { status: 400 })
    }

  } catch (error: any) {
    console.error('Error processing saved payment:', error)
    return NextResponse.json({
      error: error.message || 'Failed to process payment'
    }, { status: 500 })
  }
}

// Process Stripe payment with saved payment method


async function processStripePayment(
  gatewayPaymentMethodId: string | null,
  amount: number,
  currency: string,
  description: string
) {
  if (!gatewayPaymentMethodId) {
    throw new Error('Gateway payment method ID is required')
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    })

    // 🧩 Step 1: Retrieve payment method to get the customer ID
    const paymentMethod = await stripe.paymentMethods.retrieve(gatewayPaymentMethodId)
    const customerId = paymentMethod.customer as string | null

    if (!customerId) {
      throw new Error('Payment method is not attached to any customer.')
    }

    // 🧾 Step 2: Create PaymentIntent with the same customer
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      payment_method: gatewayPaymentMethodId,
      customer: customerId, // ✅ required
      description,
      confirm: true,
      return_url: `${process.env.WS_BASE_URL}/payment/success`,
    })

    console.log('PaymentIntent:', paymentIntent.id, paymentIntent.status)

    return {
      success: paymentIntent.status === 'succeeded' || paymentIntent.status === 'requires_capture',
      transactionId: paymentIntent.id,
      response: paymentIntent,
    }
  } catch (error: any) {
    console.error('Stripe payment processing error:', error)
    return {
      success: false,
      transactionId: null,
      response: { error: error.message },
    }
  }
}


// Process Paystack payment with saved payment method
async function processPaystackPayment(gatewayPaymentMethodId: string, amount: number, currency: string, description: string) {
  try {
    const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY!)
    
    if (!process.env.PAYSTACK_SECRET_KEY) {
      throw new Error('Paystack secret key not configured')
    }

    // Paystack doesn't have direct saved payment method charging like Stripe
    // We need to use the transaction/charge_authorization endpoint
    const response = await fetch('https://api.paystack.co/transaction/charge_authorization', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        authorization_code: gatewayPaymentMethodId,
        amount: Math.round(amount * 100), // Convert to kobo
        currency,
        reference: `paystack_${Date.now()}`,
        description
      }),
    })

    const data = await response.json()

    return {
      success: data.status === true,
      transactionId: data.data?.reference || `paystack_${Date.now()}`,
      response: data
    }
  } catch (error: any) {
    console.error('Paystack payment processing error:', error)
    return {
      success: false,
      transactionId: null,
      response: { error: error.message }
    }
  }
}
