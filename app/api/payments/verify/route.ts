import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
})

export async function POST(request: NextRequest) {
  try {
    const { gateway, reference, transactionId, status, amount, currency } = await request.json()

    if (!gateway || !reference) {
      return NextResponse.json({ error: "Gateway and reference are required" }, { status: 400 })
    }

    // Find transaction by reference
    const transaction = await prisma.transaction.findFirst({
      where: { reference },
      include: { order: true }
    })

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }

    let updatedTransaction
    let orderUpdate = {}

    switch (gateway) {
      case "STRIPE":
        updatedTransaction = await handleStripeVerification(transaction, status)
        break

      case "PAYSTACK":
        updatedTransaction = await handlePaystackVerification(transaction, reference, status)
        break

      case "FIRSTMONIE":
        updatedTransaction = await handleFirstmonieVerification(transaction, reference, status)
        break

      default:
        return NextResponse.json({ error: "Unsupported payment gateway" }, { status: 400 })
    }

    // Update order payment status if payment is successful
    if (updatedTransaction.status === "COMPLETED" && transaction.orderId) {
      await prisma.order.update({
        where: { id: transaction.orderId },
        data: { 
          paymentStatus: "PAID",
          status: "CONFIRMED"
        }
      })

      // Create commission records
      await createCommissionRecords(transaction.orderId)
    }

    return NextResponse.json({
      success: true,
      transaction: updatedTransaction,
      message: "Payment verified successfully"
    })

  } catch (error) {
    console.error("Payment verification error:", error)
    return NextResponse.json({ error: "Failed to verify payment" }, { status: 500 })
  }
}

async function handleStripeVerification(transaction: any, status: string) {
  const newStatus = status === "succeeded" ? "COMPLETED" : 
                   status === "failed" ? "FAILED" : 
                   status === "canceled" ? "CANCELLED" : "PENDING"

  return await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: newStatus,
      updatedAt: new Date(),
      metadata: {
        ...transaction.metadata,
        verifiedAt: new Date().toISOString(),
        stripeStatus: status
      }
    }
  })
}

async function handlePaystackVerification(transaction: any, reference: string, status: string) {
  // Verify with Paystack API
  const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: {
      "Authorization": `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    },
  })

  const data = await response.json()

  if (!data.status) {
    throw new Error("Paystack verification failed")
  }

  const paystackStatus = data.data.status
  const newStatus = paystackStatus === "success" ? "COMPLETED" : 
                   paystackStatus === "failed" ? "FAILED" : 
                   paystackStatus === "abandoned" ? "CANCELLED" : "PENDING"

  return await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: newStatus,
      updatedAt: new Date(),
      metadata: {
        ...transaction.metadata,
        verifiedAt: new Date().toISOString(),
        paystackStatus: paystackStatus,
        paystackData: data.data
      }
    }
  })
}

async function handleFirstmonieVerification(transaction: any, reference: string, status: string) {
  // Verify with Firstmonie API
  const response = await fetch(`https://api.firstmonie.com/v1/transactions/verify/${reference}`, {
    headers: {
      "Authorization": `Bearer ${process.env.FIRSTMONIE_SECRET_KEY}`,
    },
  })

  const data = await response.json()

  if (!data.success) {
    throw new Error("Firstmonie verification failed")
  }

  const firstmonieStatus = data.data.status
  const newStatus = firstmonieStatus === "success" ? "COMPLETED" : 
                   firstmonieStatus === "failed" ? "FAILED" : 
                   firstmonieStatus === "cancelled" ? "CANCELLED" : "PENDING"

  return await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: newStatus,
      updatedAt: new Date(),
      metadata: {
        ...transaction.metadata,
        verifiedAt: new Date().toISOString(),
        firstmonieStatus: firstmonieStatus,
        firstmonieData: data.data
      }
    }
  })
}

async function createCommissionRecords(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { vendor: true }
    })

    if (!order || !order.vendorId) return

    // Create vendor commission
    await prisma.vendorCommission.create({
      data: {
        vendorId: order.vendorId,
        orderId: orderId,
        module: order.module,
        commissionType: "VENDOR_COMMISSION",
        orderAmount: order.total,
        commissionRate: 5.0, // 5% commission
        commissionAmount: order.total * 0.05,
        status: "PENDING"
      }
    })

    // Create platform commission
    await prisma.vendorCommission.create({
      data: {
        vendorId: order.vendorId,
        orderId: orderId,
        module: order.module,
        commissionType: "PLATFORM_FEE",
        orderAmount: order.total,
        commissionRate: 2.0, // 2% platform fee
        commissionAmount: order.total * 0.02,
        status: "PENDING"
      }
    })

  } catch (error) {
    console.error("Error creating commission records:", error)
  }
}
