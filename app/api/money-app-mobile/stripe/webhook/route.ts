/**
 * Money Transfer — Stripe webhooks.
 * Register in Stripe Dashboard (Developers → Webhooks):
 *   URL:  https://<your-api-host>/api/money-app-mobile/stripe/webhook
 *   Secret: `MoneyTransferConfig.stripeWebhookSecret` or `MONEY_TRANSFER_STRIPE_WEBHOOK_SECRET`
 * Events: at least `payment_intent.succeeded`, `payment_intent.payment_failed`
 * 
 * Stripe webhook URL (Money Transfer)
Configure this in Stripe → Developers → Webhooks:

POST https://<your-backend-host>/api/money-app-mobile/stripe/webhook

Signing secret: MoneyTransferConfig.stripeWebhookSecret or MONEY_TRANSFER_STRIPE_WEBHOOK_SECRET.
Subscribe at least to: payment_intent.succeeded, payment_intent.payment_failed.
(A short comment was added at the top of stripe/webhook/route.ts with the same hints.)

Paystack verification (Stripe success → Paystack payout)
The webhook already re-reads the PaymentIntent from Stripe after payment_intent.succeeded.

New step: After Paystack’s /transfer create succeeds, we call GET https://api.paystack.co/transfer/verify/{reference} with your secret and:

Fail the payout if verification fails or status === 'failed'
Accept other statuses (e.g. pending) as OK for bank payouts
/money-app-mobile/send/confirm already verifies Paystack checkout payments with transaction/verify when gateway === "PAYSTACK" — that path is unchanged.
 */
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import Stripe from "stripe"
import { NotificationBridge } from "@/lib/notification-bridge" //@TODO: Use NotificationService instead
import { getMoneyTransferFxRate } from "@/lib/money-fx-rate"

// Get Money Transfer Stripe config (separate from marketplace)
async function getMoneyTransferStripeConfig(): Promise<{ stripe: Stripe; webhookSecret: string }> {
  const config = await prisma.moneyTransferConfig.findFirst()
  
  if (config?.stripeSecretKey && config?.stripeWebhookSecret) {
    return {
      stripe: new Stripe(config.stripeSecretKey, {
        apiVersion: "2023-10-16",
      }),
      webhookSecret: config.stripeWebhookSecret,
    }
  }
  
  // Fallback to environment variables if config not set
  if (process.env.MONEY_TRANSFER_STRIPE_SECRET_KEY && process.env.MONEY_TRANSFER_STRIPE_WEBHOOK_SECRET) {
    return {
      stripe: new Stripe(process.env.MONEY_TRANSFER_STRIPE_SECRET_KEY, {
        apiVersion: "2023-10-16",
      }),
      webhookSecret: process.env.MONEY_TRANSFER_STRIPE_WEBHOOK_SECRET,
    }
  }
  
  throw new Error("Money Transfer Stripe configuration not found")
}

// Get Money Transfer Paystack config (separate from marketplace)
async function getMoneyTransferPaystackConfig() {
  const config = await prisma.moneyTransferConfig.findFirst()
  
  if (config?.paystackSecretKey) {
    return config.paystackSecretKey
  }
  
  // Fallback to environment variable if config not set
  if (process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY) {
    return process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY
  }
  
  throw new Error("Money Transfer Paystack configuration not found")
}

/** Confirms a Paystack transfer with Paystack’s verify API (don’t rely only on the create response). */
async function verifyPaystackTransferReference(secretKey: string, reference: string) {
  const res = await fetch(
    `https://api.paystack.co/transfer/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } }
  )
  const json = await res.json()
  if (!json?.status || !json?.data) {
    throw new Error(json?.message || "Paystack transfer verification failed")
  }
  return json.data as { status?: string; amount?: number; recipient?: unknown }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get("stripe-signature")

    if (!signature) {
      return NextResponse.json({ error: "No signature provided" }, { status: 400 })
    }

    const { stripe, webhookSecret } = await getMoneyTransferStripeConfig()

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message)
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }

    // Handle the event
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent)
        break
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent)
        break
      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error("Webhook error:", error)
    return NextResponse.json(
      { error: error.message || "Webhook handler failed" },
      { status: 500 }
    )
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  try {
    const transferId = paymentIntent.metadata?.transferId

    if (!transferId) {
      console.log("Payment intent does not have transferId metadata")
      return
    }

    const { stripe } = await getMoneyTransferStripeConfig()
    const verified = await stripe.paymentIntents.retrieve(paymentIntent.id)
    if (verified.status !== "succeeded") {
      console.warn("Webhook PI not succeeded on retrieve, skipping", paymentIntent.id, verified.status)
      return
    }

    // Get transfer with receiver bank account (required)
    const transfer = await prisma.moneyTransfer.findUnique({
      where: { id: transferId },
      include: {
        payout: true,
        sender: true,
        receiver: {
          include: {
            bankAccounts: {
              where: { isVerified: true },
              orderBy: { isDefault: "desc" },
              take: 1,
            },
          },
        },
      },
    })

    if (!transfer) {
      console.error(`Transfer not found: ${transferId}`)
      return
    }

    if (transfer.payout) {
      console.log("Payout already exists, webhook idempotent skip", transferId)
      return
    }

    if (transfer.stripePaymentIntentId && transfer.stripePaymentIntentId !== paymentIntent.id) {
      console.error("Payment intent mismatch for transfer", transferId)
      return
    }

    if (!["PENDING", "PROCESSING"].includes(transfer.status)) {
      console.log("Transfer already finalized, idempotent skip", transferId, transfer.status)
      return
    }

    // Receiver MUST have verified bank account (checked at send time, but double-check)
    if (!transfer.receiver.bankAccounts || transfer.receiver.bankAccounts.length === 0) {
      console.error(`Receiver ${transfer.receiverId} does not have verified bank account`)
      // Update transfer to failed
      await prisma.moneyTransfer.update({
        where: { id: transfer.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          metadata: {
            failureReason: "Receiver bank account not verified",
          },
        },
      })
      return
    }

    const bankAccount = transfer.receiver.bankAccounts[0]

    let exchangeRate: number
    let ngnAmount: number

    if (
      transfer.receiveAmount != null &&
      transfer.customerRate != null &&
      transfer.customerRate > 0
    ) {
      ngnAmount = transfer.receiveAmount
      exchangeRate = transfer.customerRate
    } else if (transfer.customerRate != null && transfer.customerRate > 0) {
      exchangeRate = transfer.customerRate
      ngnAmount = transfer.amount * exchangeRate
    } else if (transfer.ngnAmount != null && transfer.exchangeRate != null && transfer.exchangeRate > 0) {
      ngnAmount = transfer.ngnAmount
      exchangeRate = transfer.exchangeRate
    } else {
      exchangeRate = 1500
      ngnAmount = transfer.amount * exchangeRate
      try {
        const r = await getMoneyTransferFxRate(transfer.currency, "NGN")
        if (r != null && r > 0) {
          exchangeRate = r
          ngnAmount = transfer.amount * exchangeRate
        }
      } catch (error) {
        console.error("Failed to fetch exchange rate, using fallback:", error)
      }
    }

    // Get commission setting for MONEY_TRANSFER module
    // Try PERCENTAGE first, then FIXED
    let commissionSetting = await prisma.commissionSetting.findUnique({
      where: {
        module_commissionType: {
          module: "MONEY_TRANSFER",
          commissionType: "PERCENTAGE",
        },
      },
    })

    if (!commissionSetting) {
      commissionSetting = await prisma.commissionSetting.findUnique({
        where: {
          module_commissionType: {
            module: "MONEY_TRANSFER",
            commissionType: "FIXED",
          },
        },
      })
    }

    // Calculate commission
    let commissionAmount = 0
    if (commissionSetting && commissionSetting.isActive) {
      if (commissionSetting.commissionType === "PERCENTAGE") {
        commissionAmount = (transfer.amount * commissionSetting.rate) / 100
      } else {
        commissionAmount = commissionSetting.rate
      }
    }

    // Update transfer with exchange rate and commission
    await prisma.moneyTransfer.update({
      where: { id: transfer.id },
      data: {
        ngnAmount,
        exchangeRate,
        status: "PROCESSING",
        sentAt: new Date(),
        metadata: {
          ...(transfer.metadata as any || {}),
          commissionAmount,
          commissionRate: commissionSetting?.rate || 0,
        },
      },
    })

    // Automatically initiate Paystack payout (REQUIRED - no manual withdrawal)
    let paystackReference: string | null = null
    try {
      paystackReference = await initiatePaystackPayout(transfer, bankAccount, ngnAmount, paymentIntent.id)
      
      // Update Stripe payment intent metadata with Paystack reference
      await stripe.paymentIntents.update(paymentIntent.id, {
        metadata: {
          ...paymentIntent.metadata,
          paystackReference: paystackReference,
          paystackTransferCode: paystackReference,
        },
      })
    } catch (error: any) {
      console.error("Paystack payout failed:", error)
      // Update transfer to failed
      await prisma.moneyTransfer.update({
        where: { id: transfer.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          metadata: {
            ...(transfer.metadata as any || {}),
            payoutFailureReason: error.message || "Paystack payout failed",
          },
        },
      })
      
      // Notify sender of failure
      await NotificationBridge.sendNotification({
        userId: transfer.senderId,
        title: "Transfer Failed",
        message: `Money transfer to ${transfer.receiver.name || transfer.receiver.email || transfer.receiver.phone} failed. Funds will be refunded.`,
        type: "SYSTEM",
        module: "MONEY_TRANSFER",
        data: { 
            actionType: "navigate",
            screen: "TransactionStatus",
            params: [
                { name: "transactionId", value: transfer.id },
            ],
        },
        actionUrl: `/money-app/transactions/${transfer.id}`,
      })
      return
    }

    // Create notification for receiver (money is being sent automatically - no withdrawal needed)
    await NotificationBridge.sendNotification({
      userId: transfer.receiverId,
        title: "Money Received",
        message: `You received ${transfer.currency} ${transfer.amount} (₦${ngnAmount.toFixed(2)}) from ${transfer.sender.name || transfer.sender.email || transfer.sender.phone}. The money is being automatically sent to your bank account (${bankAccount.accountNumber.slice(-4)}).`,
        type: "SYSTEM",
        module: "MONEY_TRANSFER",
        data: { 
            actionType: "navigate",
            screen: "TransactionStatus",
            params: [
                { name: "transactionId", value: transfer.id },
            ],
        },
        actionUrl: `/money-app/transactions/${transfer.id}`,
    })

    // Create notification for sender
    await prisma.notification.create({
      data: {
        userId: transfer.senderId,
        title: "Money Sent",
        message: `Your transfer of ${transfer.currency} ${transfer.amount} to ${transfer.receiver.name || transfer.receiver.email || transfer.receiver.phone} is being processed.`,
        type: "MONEY_TRANSFER",
        data: { transferId: transfer.id },
      },
    })

    console.log(`Payment succeeded for transfer ${transferId}`)
  } catch (error) {
    console.error("Error handling payment intent succeeded:", error)
  }
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  try {
    const transferId = paymentIntent.metadata?.transferId

    if (!transferId) {
      console.log("Payment intent does not have transferId metadata")
      return
    }

    // Update transfer status
    await prisma.moneyTransfer.update({
      where: { id: transferId },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        metadata: {
          failureReason: paymentIntent.last_payment_error?.message || "Payment failed",
        },
      },
    })

    // Create notification for sender
    const transfer = await prisma.moneyTransfer.findUnique({
      where: { id: transferId },
    })

    if (transfer) {
      await prisma.notification.create({
        data: {
          userId: transfer.senderId,
          title: "Payment Failed",
          message: `Your money transfer of ${transfer.currency} ${transfer.amount} failed. Please try again.`,
          type: "MONEY_TRANSFER",
          data: {
            transferId: transfer.id,
          },
        },
      })
    }

    console.log(`Payment failed for transfer ${transferId}`)
  } catch (error) {
    console.error("Error handling payment intent failed:", error)
  }
}

async function initiatePaystackPayout(
  transfer: any,
  bankAccount: any,
  ngnAmount: number,
  stripePaymentIntentId: string
): Promise<string> {
  const paystackSecretKey = await getMoneyTransferPaystackConfig()

  // Create payout record
  const payout = await prisma.moneyTransferPayout.create({
    data: {
      transferId: transfer.id,
      amount: Math.round(ngnAmount * 100), // Convert to kobo
      currency: "NGN",
      bankName: bankAccount.bankName,
      accountNumber: bankAccount.accountNumber,
      accountName: bankAccount.accountHolderName,
      bankCode: bankAccount.routingNumber || bankAccount.swiftCode || "",
      status: "PENDING",
    },
  })

  // Create Paystack transfer recipient
  const recipientResponse = await fetch("https://api.paystack.co/transferrecipient", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "nuban",
      name: bankAccount.accountHolderName,
      account_number: bankAccount.accountNumber,
      bank_code: bankAccount.routingNumber || bankAccount.swiftCode || "",
      currency: "NGN",
    }),
  })

  const recipientData = await recipientResponse.json()

  if (!recipientData.status) {
    throw new Error(recipientData.message || "Failed to create Paystack recipient")
  }

  const recipientCode = recipientData.data.recipient_code

  await prisma.moneyTransferPayout.update({
    where: { id: payout.id },
    data: {
      paystackRecipientCode: recipientCode,
    },
  })

  // Initiate Paystack transfer
  const transferResponse = await fetch("https://api.paystack.co/transfer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(ngnAmount * 100), // Amount in kobo
      recipient: recipientCode,
      reference: `MT_${transfer.reference}_${Date.now()}`,
      reason: `Money transfer withdrawal: ${transfer.reference}`,
    }),
  })

  const transferData = await transferResponse.json()

  if (!transferData.status) {
    await prisma.moneyTransferPayout.update({
      where: { id: payout.id },
      data: {
        status: "FAILED",
        failureReason: transferData.message || "Paystack transfer failed",
        paystackResponse: transferData,
        failedAt: new Date(),
      },
    })
    throw new Error(transferData.message || "Paystack transfer failed")
  }

  const paystackRef = transferData.data?.reference as string | undefined
  if (!paystackRef) {
    await prisma.moneyTransferPayout.update({
      where: { id: payout.id },
      data: { status: "FAILED", failureReason: "Missing Paystack transfer reference", failedAt: new Date() },
    })
    throw new Error("Paystack response missing transfer reference")
  }
  try {
    const verified = await verifyPaystackTransferReference(paystackSecretKey, paystackRef)
    if (verified.status === "failed") {
      throw new Error("Paystack reported transfer as failed after verify")
    }
  } catch (verErr: any) {
    await prisma.moneyTransferPayout.update({
      where: { id: payout.id },
      data: {
        status: "FAILED",
        failureReason: verErr?.message || "Paystack transfer verification failed",
        failedAt: new Date(),
      },
    })
    throw verErr
  }

  // Update payout with success
  await prisma.moneyTransferPayout.update({
    where: { id: payout.id },
    data: {
      status: "PROCESSING",
      paystackTransferCode: transferData.data.transfer_code,
      paystackReference: transferData.data.reference,
      paystackResponse: transferData,
      processedAt: new Date(),
    },
  })

  // Update transfer with bank details and status
  await prisma.moneyTransfer.update({
    where: { id: transfer.id },
    data: {
      status: "SENT",
      receiverBankName: bankAccount.bankName,
      receiverAccountNumber: bankAccount.accountNumber,
      receiverAccountName: bankAccount.accountHolderName,
      receiverBankCode: bankAccount.routingNumber || bankAccount.swiftCode || "",
      metadata: {
        ...(transfer.metadata as any || {}),
        paystackReference: transferData.data.reference,
        paystackTransferCode: transferData.data.transfer_code,
        stripePaymentIntentId,
      },
    },
  })

  // Return Paystack reference for Stripe metadata update
  return transferData.data.reference
}
