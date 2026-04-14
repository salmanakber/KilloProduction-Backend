import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
})

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const sig = request.headers.get("stripe-signature")!

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(body, sig, endpointSecret)
    } catch (err) {
      console.error("Webhook signature verification failed:", err)
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }

    // Handle the event
    switch (event.type) {
      case "payment_intent.succeeded":
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        await handlePaymentSuccess(paymentIntent)
        break

      case "payment_intent.payment_failed":
        const failedPayment = event.data.object as Stripe.PaymentIntent
        await handlePaymentFailure(failedPayment)
        break

      default:
        console.log(`Unhandled event type ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Webhook error:", error)
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  try {
    const orderId = paymentIntent.metadata.orderId
    const customerId = paymentIntent.metadata.customerId

    // Update payment status
    await prisma.payment.updateMany({
      where: { stripePaymentIntentId: paymentIntent.id },
      data: {
        status: "COMPLETED",
        paidAt: new Date(),
      },
    })

    // Update order status
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "PAID",
        status: "CONFIRMED",
      },
    })

    // Add loyalty points
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { total: true },
    })

    if (order) {
      const pointsEarned = Math.floor(order.total * 0.01) // 1% of order value
      await prisma.loyaltyTransaction.create({
        data: {
          customerId,
          type: "EARNED",
          points: pointsEarned,
          description: `Points earned from order #${orderId}`,
          orderId,
        },
      })

      // Update customer loyalty balance
      await prisma.user.update({
        where: { id: customerId },
        data: {
          loyaltyPoints: { increment: pointsEarned },
        },
      })
    }

    // Create notification
    await prisma.notification.create({
      data: {
        userId: customerId,
        title: "Payment Successful",
        message: "Your payment has been processed successfully. Your order is being prepared.",
        type: "ORDER_UPDATE",
        data: { orderId },
      },
    })
  } catch (error) {
    console.error("Error handling payment success:", error)
  }
}

async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  try {
    const orderId = paymentIntent.metadata.orderId
    const customerId = paymentIntent.metadata.customerId

    // Update payment status
    await prisma.payment.updateMany({
      where: { stripePaymentIntentId: paymentIntent.id },
      data: { status: "FAILED" },
    })

    // Update order status
    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: "FAILED" },
    })

    // Create notification
    await prisma.notification.create({
      data: {
        userId: customerId,
        title: "Payment Failed",
        message: "Your payment could not be processed. Please try again or use a different payment method.",
        type: "ORDER_UPDATE",
        data: { orderId },
      },
    })
  } catch (error) {
    console.error("Error handling payment failure:", error)
  }
}
