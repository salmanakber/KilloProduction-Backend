import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import Stripe from "stripe"
import { NotificationBridge } from "@/lib/notification-bridge" //@TODO: Use NotificationService instead

// Get Money Transfer Stripe config (separate from marketplace)
// Falls back to marketplace Stripe if Money Transfer Stripe is not configured
async function getMoneyTransferStripeConfig() {
  const config = await prisma.moneyTransferConfig.findFirst()
  
  if (config?.stripeSecretKey) {
    return new Stripe(config.stripeSecretKey, {
      apiVersion: "2023-10-16",
    })
  }
  
  // Fallback to environment variable if config not set
  if (process.env.MONEY_TRANSFER_STRIPE_SECRET_KEY) {
    return new Stripe(process.env.MONEY_TRANSFER_STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    })
  }
  
  // Fallback to marketplace Stripe if Money Transfer Stripe not configured
  // This ensures Payment Intent can be accessed by the mobile app
  const settings = await prisma.systemSettings.findFirst({
    where: { id: 1 },
    select: { paymentMethods: true },
  })
  
  if (settings?.paymentMethods) {
    const paymentMethodsData = settings.paymentMethods as any
    const marketplaceStripe = paymentMethodsData.stripe
    
    if (marketplaceStripe?.secretKey) {
      console.warn("Using marketplace Stripe for Money Transfer (Money Transfer Stripe not configured)")
      return new Stripe(marketplaceStripe.secretKey, {
        apiVersion: "2023-10-16",
      })
    }
  }
  
  // Final fallback to environment variable
  if (process.env.STRIPE_SECRET_KEY) {
    console.warn("Using environment STRIPE_SECRET_KEY for Money Transfer")
    return new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    })
  }
  
  throw new Error("Stripe configuration not found. Please configure Money Transfer Stripe keys in admin panel or use marketplace Stripe.")
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json( { success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { receiverId, amount, currency = "USD", description } = await request.json()
   
    // Validation
    if (!receiverId || !amount || amount <= 0) {
      return NextResponse.json( 
        { success: false, error: "Receiver ID and valid amount are required" },
        { status: 400 }
      )
    }

    // Check if receiver exists and is registered
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      include: { 
        userProfile: true,
        bankAccounts: {
          where: { isVerified: true },
          take: 1,
        },
      },
    })

    if (!receiver) {
      return NextResponse.json( 
        { success: false, error: "Receiver not found. Only registered users can receive money." },
        { status: 404 }
      )
    }

    if (receiver.id === user.id) {
      return NextResponse.json( 
        { success: false, error: "Cannot send money to yourself" },
        { status: 400 }
      )
    }

    // Check if receiver has a verified bank account (REQUIRED for automatic payout)
    if (!receiver.bankAccounts || receiver.bankAccounts.length === 0) {
      return NextResponse.json( 
        { 
          error: "Receiver bank account required",
          message: "The receiver must have a verified bank account to receive money. Please ask them to add and verify their bank account first.",
          requiresReceiverBankAccount: true,
        },
        { status: 400 }
      )
    }

    // Check if sender has a verified bank account (required for money transfer)
    const senderBankAccount = await prisma.bankAccount.findFirst({
      where: {
        userId: user.id,
        isVerified: true,
      },
    })

    if (!senderBankAccount) {
      return NextResponse.json( 
        { 
          error: "Bank account verification required",
          message: "Please add and verify your bank account before sending money. This is required for security and compliance.",
          requiresBankAccount: true,
        },
        { status: 400 }
      )
    }

    // Check module configuration
    const config = await prisma.moneyTransferConfig.findFirst()
    if (!config || !config.isEnabled) {
      return NextResponse.json( 
        { success: false, error: "Money transfer module is currently disabled" },
        { status: 503 }
      )
    }

    // Validate amount limits
    if (amount < config.minTransferAmount) {
      return NextResponse.json( 
        { success: false, error: `Minimum transfer amount is ${config.minTransferAmount} ${currency}` },
        { status: 400 }
      )
    }

    if (amount > config.maxTransferAmount) {
      return NextResponse.json( 
        { success: false, error: `Maximum transfer amount is ${config.maxTransferAmount} ${currency}` },
        { status: 400 }
      )
    }

    // Calculate fees
    const feePercentage = config.transferFeePercentage || 0
    const feeFixed = config.transferFeeFixed || 0
    const totalFee = (amount * feePercentage) / 100 + feeFixed
    const totalAmount = amount + totalFee

    // Create money transfer record
    const transfer = await prisma.moneyTransfer.create({
      data: {
        senderId: user.id,
        receiverId: receiver.id,
        amount,
        currency,
        description: description || `Money transfer to ${receiver.name || receiver.email || receiver.phone}`,
        status: "PENDING",
        reference: `MT_${Date.now()}_${user.id.substring(0, 8)}`,
        metadata: {
          fee: totalFee,
          feePercentage,
          feeFixed,
          totalAmount,
        },
      },
    })

    // Create Stripe payment intent
    const stripe = await getMoneyTransferStripeConfig()
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      description: `Money transfer: ${transfer.reference}`,
      metadata: {
        transferId: transfer.id,
        senderId: user.id,
        receiverId: receiver.id,
        type: "MONEY_TRANSFER",
      },
    })

    // Update transfer with Stripe payment intent
    await prisma.moneyTransfer.update({
      where: { id: transfer.id },
      data: {
        stripePaymentIntentId: paymentIntent.id,
        stripeClientSecret: paymentIntent.client_secret,
        stripeAmount: paymentIntent.amount,
      },
    })

    // Create notification for receiver
    await NotificationBridge.sendNotification({
        userId: receiver.id,
        title: "Money Transfer Incoming",
        message: `${user.name || user.email || user.phone} is sending you ${currency} ${amount}`,
        type: "SYSTEM",
        module: "MONEY_TRANSFER",
        data: { 
            actionType: "navigate",
            screen: "TransactionStatus",
            params: [
                { name: "transactionId", value: transfer.id },
            ],
        },
        actionUrl: `/money-app/transfers/${transfer.id}`,
    })

    return NextResponse.json( {
      success: true,
      transfer: {
        id: transfer.id,
        reference: transfer.reference,
        amount,
        currency,
        fee: totalFee,
        totalAmount,
        status: transfer.status,
      },
      payment: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      },
    })
  } catch (error: any) {
    console.error("Error creating money transfer:", error)
    return NextResponse.json( 
      { success: false, error: error.message || "Failed to create money transfer" },
      { status: 500 }
    )
  }
}
