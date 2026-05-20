import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import Stripe from "stripe"
import { NotificationBridge } from "@/lib/notification-bridge" //@TODO: Use NotificationService instead
import { computeMoneyTransferFinancials } from "@/lib/money-transfer-financial-snapshot"
import { parseTransferSettlementMode } from "@/lib/money-transfer-wallet"
import { assertPlausibleConversion } from "@/lib/money-fx-rate"
import {
  enforceMoneyTransferSecurity,
  MoneyRiskBlocked,
  MoneyRiskStepUpRequired,
} from "@/lib/money-transfer-risk"
import { completeMoneyTransferFromWallet } from "@/lib/money-transfer-send-wallet"
import {
  chargeMoneyTransferWithSavedCard,
  getOrCreateMoneyStripeCustomer,
} from "@/lib/money-transfer-stripe-cards"
import { settleMoneyTransferAfterPayment } from "@/lib/money-transfer-settlement"

async function initializePaystackPayment(args: {
  secretKey: string
  email: string
  amount: number
  reference: string
  metadata: Record<string, unknown>
  callbackUrl?: string
}) {
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: args.email,
      amount: Math.round(args.amount * 100),
      currency: "NGN",
      reference: args.reference,
      callback_url: args.callbackUrl,
      metadata: args.metadata,
    }),
  })
  const payload = await response.json()
  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || "Failed to initialize Paystack payment")
  }
  return payload.data as { authorization_url: string; access_code: string; reference: string }
}

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

    const body = await request.json()
    const {
      receiverId,
      amount,
      currency = "USD",
      receiveCurrency: receiveCurrencyBody,
      settlementMode: settlementModeBody,
      expectedReceiveAmount,
      description,
      paymentSource = "CARD",
      savedPaymentMethodId,
    } = body

    try {
      await enforceMoneyTransferSecurity({
        userId: user.id,
        action: "SEND_MONEY",
        request,
        body,
        amount,
        currency,
        receiverId,
      })
    } catch (riskErr) {
      if (riskErr instanceof MoneyRiskBlocked) {
        return NextResponse.json(
          { success: false, error: riskErr.message, blocked: true, code: riskErr.code },
          { status: 403 },
        )
      }
      if (riskErr instanceof MoneyRiskStepUpRequired) {
        return NextResponse.json(
          {
            success: false,
            error: riskErr.message,
            requiresStepUp: true,
            code: riskErr.code,
          },
          { status: 403 },
        )
      }
      throw riskErr
    }
   
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

    const config = await prisma.moneyTransferConfig.findFirst()
    if (!config || !config.isEnabled) {
      return NextResponse.json( 
        { success: false, error: "Money transfer module is currently disabled" },
        { status: 503 }
      )
    }

    const defaultSettlementMode = config.settlementMode ?? "WALLET"
    const transferSettlementMode = parseTransferSettlementMode(
      settlementModeBody,
      defaultSettlementMode,
    )
    const receiveCurrency = String(receiveCurrencyBody || currency)
      .trim()
      .toUpperCase()
      .slice(0, 3)

    if (
      transferSettlementMode === "DIRECT_BANK" &&
      (!receiver.bankAccounts || receiver.bankAccounts.length === 0)
    ) {
      return NextResponse.json(
        {
          error: "Receiver bank account required",
          message:
            "The receiver must have a verified bank account to receive money directly to their bank. Ask them to add one, or send to their Kilo wallet instead.",
          requiresReceiverBankAccount: true,
        },
        { status: 400 },
      )
    }

    const paySource = String(paymentSource || "CARD").toUpperCase()

    if (paySource !== "WALLET") {
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
            message:
              "Please add and verify your bank account before paying by card. You can pay from your Kilo wallet without a linked bank account.",
            requiresBankAccount: true,
          },
          { status: 400 },
        )
      }
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

    const fin = await computeMoneyTransferFinancials({
      sendAmount: amount,
      sendCurrency: currency,
      feeInSendCurrency: totalFee,
      settlementCurrency: receiveCurrency,
    })

    if (fin.receiveAmount == null || fin.receiveAmount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Exchange rate unavailable",
          message: `Cannot convert ${currency} to ${receiveCurrency} right now. Try again later.`,
        },
        { status: 400 },
      )
    }

    assertPlausibleConversion(amount, currency, fin.receiveAmount, receiveCurrency)

    if (expectedReceiveAmount != null && Number(expectedReceiveAmount) > 0) {
      const expected = Number(expectedReceiveAmount)
      const tolerance = Math.max(0.5, fin.receiveAmount * 0.02)
      if (Math.abs(fin.receiveAmount - expected) > tolerance) {
        return NextResponse.json(
          {
            success: false,
            error: "Rate changed",
            message:
              "The exchange rate changed before we could lock your transfer. Please review the amount and try again.",
            serverReceiveAmount: fin.receiveAmount,
            clientReceiveAmount: expected,
          },
          { status: 409 },
        )
      }
    }

    // Create money transfer record (financial snapshot locked at creation — never recomputed)
    const transfer = await prisma.moneyTransfer.create({
      data: {
        senderId: user.id,
        receiverId: receiver.id,
        amount,
        currency,
        description: description || `Money transfer to ${receiver.name || receiver.email || receiver.phone}`,
        status: "PENDING",
        reference: `MT_${Date.now()}_${user.id.substring(0, 8)}`,
        ngnAmount:
          receiveCurrency === "NGN"
            ? (fin.receiveAmount ?? (currency.toUpperCase() === "NGN" ? amount : undefined))
            : undefined,
        exchangeRate: fin.customerRate ?? undefined,
        receiveAmount: fin.receiveAmount,
        receiveCurrency: fin.receiveCurrency ?? receiveCurrency,
        settlementMode: transferSettlementMode,
        baseCurrency: fin.baseCurrency,
        baseAmount: fin.baseAmount ?? undefined,
        midMarketRate: fin.midMarketRate ?? undefined,
        customerRate: fin.customerRate ?? undefined,
        markupPercentage: fin.markupPercentage ?? undefined,
        rateSource: fin.rateSource,
        fee: fin.fee,
        feeBase: fin.feeBase ?? undefined,
        fxMarginSettlement: fin.fxMarginSettlement ?? undefined,
        fxMarginBase: fin.fxMarginBase ?? undefined,
        metadata: {
          fee: totalFee,
          feePercentage,
          feeFixed,
          totalAmount,
        },
      },
    })

    if (paySource === "WALLET") {
      const completed = await completeMoneyTransferFromWallet(transfer.id)
      return NextResponse.json({
        success: true,
        transfer: {
          id: transfer.id,
          reference: transfer.reference,
          amount,
          currency,
          fee: totalFee,
          totalAmount,
          status: completed?.status ?? "COMPLETED",
        },
        payment: { gateway: "WALLET", paid: true },
      })
    }

    const settings = await prisma.systemSettings.findFirst({ select: { paymentMethods: true } })
    const paymentMethods = (settings?.paymentMethods || {}) as any
    const primaryGateway = String(paymentMethods?.primaryGateway || paymentMethods?.primary || "STRIPE").toUpperCase()
    const shouldUsePaystack = primaryGateway === "PAYSTACK" && Boolean(config?.paystackSecretKey)
    let payment: Record<string, unknown>

    if (savedPaymentMethodId && !shouldUsePaystack) {
      const customerId = await getOrCreateMoneyStripeCustomer(user.id)
      const intent = await chargeMoneyTransferWithSavedCard({
        userId: user.id,
        transferId: transfer.id,
        paymentMethodId: savedPaymentMethodId,
        amount: totalAmount,
        currency,
        customerId,
      })
      await settleMoneyTransferAfterPayment(transfer.id, intent.id)
      return NextResponse.json({
        success: true,
        transfer: {
          id: transfer.id,
          reference: transfer.reference,
          amount,
          currency,
          fee: totalFee,
          totalAmount,
          status: "COMPLETED",
        },
        payment: { gateway: "STRIPE", paid: true, savedCard: true },
      })
    }

    if (shouldUsePaystack) {
      const paystackInit = await initializePaystackPayment({
        secretKey: config.paystackSecretKey as string,
        email: user.email || `${user.id}@killo.local`,
        amount: totalAmount,
        reference: transfer.reference,
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/money-transfer/return`,
        metadata: {
          transferId: transfer.id,
          senderId: user.id,
          receiverId: receiver.id,
          type: "MONEY_TRANSFER",
        },
      })

      payment = {
        gateway: "PAYSTACK",
        authorizationUrl: paystackInit.authorization_url,
        accessCode: paystackInit.access_code,
        reference: paystackInit.reference,
      }
    } else {
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

      await prisma.moneyTransfer.update({
        where: { id: transfer.id },
        data: {
          stripePaymentIntentId: paymentIntent.id,
          stripeClientSecret: paymentIntent.client_secret,
          stripeAmount: paymentIntent.amount,
        },
      })

      payment = {
        gateway: "STRIPE",
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      }
    }

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
      payment,
    })
  } catch (error: any) {
    console.error("Error creating money transfer:", error)
    return NextResponse.json( 
      { success: false, error: error.message || "Failed to create money transfer" },
      { status: 500 }
    )
  }
}
