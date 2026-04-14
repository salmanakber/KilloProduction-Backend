import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { orderId, amount, currency = "usd", paymentMethod } = await request.json()

    if (!orderId || !amount) {
      return NextResponse.json({ error: "Order ID and amount are required" }, { status: 400 })
    }

    // Get order details
    const order = await prisma.order.findUnique({
      where: { id: orderId, customerId: session.user.id },
      include: {
        customer: true,
        vendor: { select: { businessName: true } },
      },
    })

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      customer: order.customer.stripeCustomerId || undefined,
      metadata: {
        orderId: order.id,
        customerId: session.user.id,
        vendorId: order.vendorId || "",
      },
      description: `Payment for order #${order.orderNumber}`,
    })

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        customerId: session.user.id,
        vendorId: order.vendorId,
        amount,
        currency,
        paymentMethod: paymentMethod || "CARD",
        stripePaymentIntentId: paymentIntent.id,
        status: "PENDING",
      },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentId: payment.id,
    })
  } catch (error) {
    console.error("Error creating payment intent:", error)
    return NextResponse.json({ error: "Failed to create payment intent" }, { status: 500 })
  }
}
