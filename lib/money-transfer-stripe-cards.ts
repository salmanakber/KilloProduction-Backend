import Stripe from "stripe"
import { prisma } from "@/lib/prisma"

async function getMoneyStripe(): Promise<Stripe> {
  const config = await prisma.moneyTransferConfig.findFirst()
  const key =
    config?.stripeSecretKey || process.env.MONEY_TRANSFER_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("Stripe is not configured for money transfer")
  return new Stripe(key, { apiVersion: "2023-10-16" })
}

const MONEY_GATEWAY = "stripe_money_transfer"

export async function getOrCreateMoneyStripeCustomer(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, phone: true },
  })
  if (!user) throw new Error("User not found")

  const stripe = await getMoneyStripe()

  if (user.email) {
    const listed = await stripe.customers.list({ email: user.email, limit: 1 })
    if (listed.data[0]?.id) return listed.data[0].id
  }

  const customer = await stripe.customers.create({
    email: user.email || undefined,
    name: user.name || undefined,
    phone: user.phone || undefined,
    metadata: { userId, module: "MONEY_TRANSFER" },
  })
  return customer.id
}

export async function listMoneySavedCards(userId: string) {
  return prisma.paymentMethod.findMany({
    where: { userId, gateway: MONEY_GATEWAY, isActive: true, type: "CARD" },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      last4: true,
      lastFour: true,
      brand: true,
      expiryMonth: true,
      expiryYear: true,
      isDefault: true,
      gatewayPaymentMethodId: true,
    },
  })
}

export async function createMoneyCardSetupIntent(userId: string) {
  const stripe = await getMoneyStripe()
  const customerId = await getOrCreateMoneyStripeCustomer(userId)
  const intent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
    usage: "off_session",
    metadata: { userId, module: "MONEY_TRANSFER" },
  })
  return {
    clientSecret: intent.client_secret,
    setupIntentId: intent.id,
    customerId,
  }
}

export async function saveMoneyCardFromSetupIntent(userId: string, setupIntentId: string) {
  const stripe = await getMoneyStripe()
  const intent = await stripe.setupIntents.retrieve(setupIntentId)
  if (intent.status !== "succeeded" || !intent.payment_method) {
    throw new Error("Card setup was not completed")
  }
  const pmId =
    typeof intent.payment_method === "string"
      ? intent.payment_method
      : intent.payment_method.id
  const pm = await stripe.paymentMethods.retrieve(pmId)
  if (pm.type !== "card" || !pm.card) {
    throw new Error("Only card payment methods are supported")
  }

  const existing = await prisma.paymentMethod.findFirst({
    where: { gatewayPaymentMethodId: pm.id },
  })
  if (existing) return existing

  const count = await prisma.paymentMethod.count({
    where: { userId, gateway: MONEY_GATEWAY, isActive: true },
  })

  return prisma.paymentMethod.create({
    data: {
      userId,
      type: "CARD",
      provider: pm.card.brand || "card",
      token: pm.id,
      last4: pm.card.last4,
      lastFour: pm.card.last4,
      brand: pm.card.brand,
      expiryMonth: pm.card.exp_month,
      expiryYear: pm.card.exp_year,
      gateway: MONEY_GATEWAY,
      gatewayPaymentMethodId: pm.id,
      isDefault: count === 0,
      isActive: true,
    },
  })
}

export async function saveMoneyCardFromPaymentIntent(userId: string, paymentIntentId: string) {
  const stripe = await getMoneyStripe()
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId)
  const pmRef = intent.payment_method
  const pmId = typeof pmRef === "string" ? pmRef : pmRef?.id
  if (!pmId) throw new Error("No card on this payment")

  const pm = await stripe.paymentMethods.retrieve(pmId)
  if (pm.type !== "card" || !pm.card) throw new Error("Only card payments can be saved")

  const existing = await prisma.paymentMethod.findFirst({
    where: { gatewayPaymentMethodId: pm.id },
  })
  if (existing) return existing

  const customerId = await getOrCreateMoneyStripeCustomer(userId)
  try {
    await stripe.paymentMethods.attach(pm.id, { customer: customerId })
  } catch {
    /* may already be attached */
  }

  const count = await prisma.paymentMethod.count({
    where: { userId, gateway: MONEY_GATEWAY, isActive: true },
  })

  return prisma.paymentMethod.create({
    data: {
      userId,
      type: "CARD",
      provider: pm.card.brand || "card",
      token: pm.id,
      last4: pm.card.last4,
      lastFour: pm.card.last4,
      brand: pm.card.brand,
      expiryMonth: pm.card.exp_month,
      expiryYear: pm.card.exp_year,
      gateway: MONEY_GATEWAY,
      gatewayPaymentMethodId: pm.id,
      isDefault: count === 0,
      isActive: true,
    },
  })
}

export async function chargeMoneyTransferWithSavedCard(args: {
  userId: string
  transferId: string
  paymentMethodId: string
  amount: number
  currency: string
  customerId: string
}) {
  const stripe = await getMoneyStripe()
  const saved = await prisma.paymentMethod.findFirst({
    where: {
      id: args.paymentMethodId,
      userId: args.userId,
      gateway: MONEY_GATEWAY,
      isActive: true,
    },
  })
  if (!saved?.gatewayPaymentMethodId) {
    throw new Error("Saved card not found")
  }

  const intent = await stripe.paymentIntents.create({
    amount: Math.round(args.amount * 100),
    currency: args.currency.toLowerCase(),
    customer: args.customerId,
    payment_method: saved.gatewayPaymentMethodId,
    off_session: true,
    confirm: true,
    metadata: {
      transferId: args.transferId,
      type: "MONEY_TRANSFER",
      savedCard: "true",
    },
  })

  if (intent.status !== "succeeded") {
    throw new Error(`Payment failed: ${intent.status}`)
  }

  const transfer = await prisma.moneyTransfer.findUnique({ where: { id: args.transferId } })
  await prisma.moneyTransfer.update({
    where: { id: args.transferId },
    data: {
      stripePaymentIntentId: intent.id,
      stripeAmount: intent.amount,
      metadata: {
        ...((transfer?.metadata as object) || {}),
        paymentSource: "CARD",
        savedPaymentMethodId: args.paymentMethodId,
      },
    },
  })

  return intent
}

export async function chargeMoneyWalletTopUpWithSavedCard(args: {
  userId: string
  walletTransactionId: string
  reference: string
  paymentMethodId: string
  amount: number
  currency: string
}) {
  const stripe = await getMoneyStripe()
  const customerId = await getOrCreateMoneyStripeCustomer(args.userId)
  const saved = await prisma.paymentMethod.findFirst({
    where: {
      id: args.paymentMethodId,
      userId: args.userId,
      gateway: MONEY_GATEWAY,
      isActive: true,
    },
  })
  if (!saved?.gatewayPaymentMethodId) {
    throw new Error("Saved card not found")
  }

  const intent = await stripe.paymentIntents.create({
    amount: Math.round(args.amount * 100),
    currency: args.currency.toLowerCase(),
    customer: customerId,
    payment_method: saved.gatewayPaymentMethodId,
    off_session: true,
    confirm: true,
    metadata: {
      type: "WALLET_TOPUP",
      walletTransactionId: args.walletTransactionId,
      reference: args.reference,
      savedCard: "true",
      savedPaymentMethodId: args.paymentMethodId,
    },
  })

  if (intent.status === "requires_action" && intent.client_secret) {
    return {
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      requiresAction: true as const,
    }
  }

  if (intent.status !== "succeeded") {
    throw new Error(`Payment failed: ${intent.status}`)
  }

  return {
    paymentIntentId: intent.id,
    succeeded: true as const,
  }
}

export async function createMoneyWalletTopUpPaymentIntent(args: {
  userId: string
  walletTransactionId: string
  reference: string
  amount: number
  currency: string
  saveCard?: boolean
}) {
  const stripe = await getMoneyStripe()
  const customerId = await getOrCreateMoneyStripeCustomer(args.userId)

  const intent = await stripe.paymentIntents.create({
    amount: Math.round(args.amount * 100),
    currency: args.currency.toLowerCase(),
    customer: customerId,
    description: `Kilo wallet top-up ${args.reference}`,
    payment_method_types: ["card"],
    ...(args.saveCard ? { setup_future_usage: "off_session" as const } : {}),
    metadata: {
      type: "WALLET_TOPUP",
      userId: args.userId,
      walletTransactionId: args.walletTransactionId,
      reference: args.reference,
      saveCard: args.saveCard ? "true" : "false",
    },
  })

  if (!intent.client_secret) {
    throw new Error("Could not start card payment")
  }

  return {
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
  }
}
