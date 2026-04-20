import Stripe from "stripe"
import { prisma } from "./prisma"

// Payment gateway configuration interface
interface PaymentGatewayConfig {
  stripe: {
    secretKey: string
    publishableKey: string
    webhookSecret?: string
  }
  paystack: {
    secretKey: string
    publicKey: string
  }
  firstmonie: {
    secretKey: string
    publicKey: string
  }
}

// Initialize payment gateways with dynamic API keys
let stripeInstance: Stripe | null = null
let paymentGatewayConfig: PaymentGatewayConfig | null = null

// Function to get payment gateway configuration
async function getPaymentGatewayConfig(): Promise<PaymentGatewayConfig> {
  if (paymentGatewayConfig) {
    return paymentGatewayConfig
  }

  try {
    // Try to get from database settings first
    const settings = await prisma.systemSettings.findFirst({
      where: { id: 1 }
    })

    let config: PaymentGatewayConfig

    if (settings?.paymentMethods && typeof settings.paymentMethods === 'object') {
      const paymentMethodsData = settings.paymentMethods as any
      config = {
        stripe: {
          secretKey: paymentMethodsData.stripe?.secretKey || process.env.STRIPE_SECRET_KEY || '',
          publishableKey: paymentMethodsData.stripe?.publishableKey || process.env.STRIPE_PUBLISHABLE_KEY || '',
          webhookSecret: paymentMethodsData.stripe?.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET
        },
        paystack: {
          secretKey: paymentMethodsData.paystack?.secretKey || process.env.PAYSTACK_SECRET_KEY || '',
          publicKey: paymentMethodsData.paystack?.publicKey || process.env.PAYSTACK_PUBLIC_KEY || ''
        },
        firstmonie: {
          secretKey: paymentMethodsData.firstmonie?.secretKey || process.env.FIRSTMONIE_SECRET_KEY || '',
          publicKey: paymentMethodsData.firstmonie?.publicKey || process.env.FIRSTMONIE_PUBLIC_KEY || ''
        }
      }
    } else {
      // Fallback to environment variables
      config = {
        stripe: {
          secretKey: process.env.STRIPE_SECRET_KEY || '',
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
        },
        paystack: {
          secretKey: process.env.PAYSTACK_SECRET_KEY || '',
          publicKey: process.env.PAYSTACK_PUBLIC_KEY || ''
        },
        firstmonie: {
          secretKey: process.env.FIRSTMONIE_SECRET_KEY || '',
          publicKey: process.env.FIRSTMONIE_PUBLIC_KEY || ''
        }
      }
    }

    paymentGatewayConfig = config
    return config
  } catch (error) {
    console.error('Error loading payment gateway config:', error)
    // Return fallback config from environment variables
    return {
      stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY || '',
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
      },
      paystack: {
        secretKey: process.env.PAYSTACK_SECRET_KEY || '',
        publicKey: process.env.PAYSTACK_PUBLIC_KEY || ''
      },
      firstmonie: {
        secretKey: process.env.FIRSTMONIE_SECRET_KEY || '',
        publicKey: process.env.FIRSTMONIE_PUBLIC_KEY || ''
      }
    }
  }
}

// Function to get Stripe instance
async function getStripeInstance(): Promise<Stripe> {
  if (stripeInstance) {
    return stripeInstance
  }

  const config = await getPaymentGatewayConfig()
  
  if (!config.stripe.secretKey) {
    throw new Error('Stripe secret key not configured')
  }
  

  stripeInstance = new Stripe(config.stripe.secretKey, {
    apiVersion: "2023-10-16",
  })

  return stripeInstance
}

// Payment gateway configurations
const PAYMENT_GATEWAYS = {
  STRIPE: {
    name: "Stripe",
    isActive: true,
    supportedCurrencies: ["USD", "EUR", "GBP", "NGN"],
    fees: { percentage: 2.9, fixed: 30 }, // 2.9% + 30¢
  },
  PAYSTACK: {
    name: "Paystack",
    isActive: true,
    supportedCurrencies: ["NGN", "GHS", "ZAR", "USD"],
    fees: { percentage: 1.5, fixed: 100 }, // 1.5% + ₦100
  },
  FIRSTMONIE: {
    name: "Firstmonie",
    isActive: false,
    supportedCurrencies: ["NGN"],
    fees: { percentage: 1.0, fixed: 50 }, // 1.0% + ₦50
  },
}

export interface PaymentIntentData {
  amount: number
  currency: string
  gateway: string
  orderId: string
  description: string
  customerEmail: string
  customerPhone?: string
  metadata?: any
}

export interface PaymentIntentResult {
  id: string
  clientSecret?: string
  authorizationUrl?: string
  reference?: string
  amount: number
  currency: string
  status: string
  gateway: string
}

export async function createPaymentIntent(data: PaymentIntentData): Promise<PaymentIntentResult> {
  const { amount, currency, gateway, orderId, description, customerEmail, customerPhone, metadata = {} } = data

  // Validate gateway
  if (!PAYMENT_GATEWAYS[gateway as keyof typeof PAYMENT_GATEWAYS]) {
    throw new Error("Invalid payment gateway")
  }

  // Create payment intent based on gateway
  switch (gateway) {
    case "STRIPE":
      return await createStripePaymentIntent({
        amount,
        currency,
        description,
        customerEmail,
        // Prisma Payment id — must not be overwritten by client metadata keys
        metadata: { ...metadata, orderId },
      })

    case "PAYSTACK":
      return await createPaystackPaymentIntent({
        amount,
        currency,
        email: customerEmail,
        reference: `PAYSTACK_${orderId}_${Date.now()}`,
        metadata: { ...metadata, orderId },
      })

    // case "FIRSTMONIE":
    //   return await createFirstmoniePaymentIntent({
    //     amount,
    //     currency,
    //     phone: customerPhone || "",
    //     reference: `FIRSTMONIE_${orderId}_${Date.now()}`,
    //     metadata: { orderId, ...metadata }
    //   })

    default:
      throw new Error("Unsupported payment gateway")
  }
}

// Stripe payment intent creation
async function createStripePaymentIntent({
  amount,
  currency,
  description,
  customerEmail,
  metadata
}: {
  amount: number
  currency: string
  description: string
  customerEmail: string
  metadata: any
}): Promise<PaymentIntentResult> {
  try {
    const stripe = await getStripeInstance()
    
    // Check if we should save the payment method
    const savePaymentMethod = metadata?.savePaymentMethod === true
    
    // Create or get customer for saving payment methods
    let customerId: string | undefined
    if (savePaymentMethod && metadata?.userId) {
      try {
        // Check if customer already exists
        const existingCustomers = await stripe.customers.list({
          email: customerEmail,
          limit: 1
        })

        if (existingCustomers.data.length > 0) {
          customerId = existingCustomers.data[0].id
        } else {
          // Create new customer
          const customer = await stripe.customers.create({
            email: customerEmail,
            metadata: {
              userId: metadata.userId
            }
          })
          customerId = customer.id
        }
      } catch (error) {
        console.error('Error creating/finding customer:', error)
        // Continue without customer if there's an error
      }
    }
    
    const paymentIntentData: any = {
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      description,
      receipt_email: customerEmail,
      metadata,
    }

    if (customerId) {
      paymentIntentData.customer = customerId
    }

    if (savePaymentMethod) {
      // Enable saving payment method for future use
      paymentIntentData.setup_future_usage = 'off_session'
      paymentIntentData.payment_method_types = ['card']
    } else {
      paymentIntentData.automatic_payment_methods = {
        enabled: true,
      }
    }
    
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData)

    return {
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret!,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      gateway: "STRIPE",
      savePaymentMethod,
    }
  } catch (error: any) {
    console.error('Stripe payment intent creation error:', error)
    throw new Error(`Stripe payment failed: ${error.message}`)
  }
}

// Paystack payment intent creation
async function createPaystackPaymentIntent({
  amount,
  currency,
  email,
  reference,
  metadata
}: {
  amount: number
  currency: string
  email: string
  reference: string
  metadata: any
}): Promise<PaymentIntentResult> {
  try {
    const config = await getPaymentGatewayConfig()
    
    if (!config.paystack.secretKey) {
      throw new Error('Paystack secret key not configured')
    }

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.paystack.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // Convert to kobo
        email,
        currency,
        reference,
        metadata,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment/verify`,
      }),
    })

    const data = await response.json()

    if (!data.status) {
      throw new Error(data.message || "Paystack payment initialization failed")
    }

    return {
      id: data.data.reference,
      authorizationUrl: data.data.authorization_url,
      reference: data.data.reference,
      amount: data.data.amount,
      currency: data.data.currency,
      status: "pending",
      gateway: "PAYSTACK",
    }
  } catch (error: any) {
    console.error('Paystack payment intent creation error:', error)
    throw new Error(`Paystack payment failed: ${error.message}`)
  }
}

// Firstmonie payment intent creation
async function createFirstmoniePaymentIntent({
  amount,
  currency,
  phone,
  reference,
  metadata
}: {
  amount: number
  currency: string
  phone: string
  reference: string
  metadata: any
}): Promise<PaymentIntentResult> {
  try {
    const config = await getPaymentGatewayConfig()
    
    if (!config.firstmonie.secretKey) {
      throw new Error('Firstmonie secret key not configured')
    }

    const response = await fetch("https://api.firstmonie.com/v1/transactions/initialize", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.firstmonie.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // Convert to kobo
        phone,
        currency,
        reference,
        metadata,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment/verify`,
      }),
    })

    const data = await response.json()

    if (!data.success) {
      throw new Error(data.message || "Firstmonie payment initialization failed")
    }

    return {
      id: data.data.reference,
      authorizationUrl: data.data.authorization_url,
      reference: data.data.reference,
      amount: data.data.amount,
      currency: data.data.currency,
      status: "pending",
      gateway: "FIRSTMONIE",
    }
  } catch (error: any) {
    console.error('Firstmonie payment intent creation error:', error)
    throw new Error(`Firstmonie payment failed: ${error.message}`)
  }
}

const DEFAULT_PRIMARY_GATEWAY = "STRIPE"

/**
 * Primary gateway from system settings (`paymentMethods.primaryGateway`) and first other configured gateway as fallback.
 */
export async function getPrimaryAndFallbackGateways(
  currency: string = "NGN"
): Promise<{ primary: string; fallback: string | null; gateways: any[] }> {
  const gateways = await getAvailableGateways(currency)
  if (gateways.length === 0) {
    return { primary: DEFAULT_PRIMARY_GATEWAY, fallback: null, gateways }
  }

  let settingsPrimary: string | null = null
  try {
    const settings = await prisma.systemSettings.findFirst({ where: { id: 1 } })
    const pm = settings?.paymentMethods as Record<string, unknown> | null | undefined
    const raw = pm?.primaryGateway ?? pm?.primary
    if (typeof raw === "string" && raw) {
      settingsPrimary = raw.toUpperCase()
    }
  } catch {
    settingsPrimary = null
  }

  const ids = new Set(gateways.map((g) => g.id))
  let primary = DEFAULT_PRIMARY_GATEWAY
  if (settingsPrimary && ids.has(settingsPrimary)) {
    primary = settingsPrimary
  } else if (ids.has(DEFAULT_PRIMARY_GATEWAY)) {
    primary = DEFAULT_PRIMARY_GATEWAY
  } else {
    primary = gateways[0].id
  }

  const fallback = gateways.find((g) => g.id !== primary)?.id ?? null

  return { primary, fallback, gateways }
}

// Get available payment gateways
export async function getAvailableGateways(currency: string = "NGN") {
  try {
    const config = await getPaymentGatewayConfig()
    
    // Check which gateways have API keys configured
    const availableGateways: any[] = []
    
    if (config.stripe.secretKey && config.stripe.publishableKey) {
      availableGateways.push({
        id: "STRIPE",
        name: "Stripe",
        fees: { percentage: 2.9, fixed: 30 },
        supportedCurrencies: ["USD", "EUR", "GBP", "NGN"],
        publicKey: config.stripe.publishableKey
      })
    }
    
    if (config.paystack.secretKey && config.paystack.publicKey) {
      availableGateways.push({
        id: "PAYSTACK",
        name: "Paystack",
        fees: { percentage: 1.5, fixed: 100 },
        supportedCurrencies: ["NGN", "GHS", "ZAR", "USD"],
        publicKey: config.paystack.publicKey
      })
    }
    
    // if (config.firstmonie.secretKey && config.firstmonie.publicKey) {
    //   availableGateways.push({
    //     id: "FIRSTMONIE",
    //     name: "Firstmonie",
    //     fees: { percentage: 1.0, fixed: 50 },
    //     supportedCurrencies: ["NGN"],
    //     publicKey: config.firstmonie.publicKey
    //   })
    // }
    
    return availableGateways.filter(gateway => 
      gateway.supportedCurrencies.includes(currency)
    )
  } catch (error) {
    console.error('Error getting available gateways:', error)
    // Return empty array if there's an error
    return []
  }
}

// Calculate payment fees
export function calculateFees(amount: number, gateway: string): { fee: number; total: number } {
  const gatewayConfig = PAYMENT_GATEWAYS[gateway as keyof typeof PAYMENT_GATEWAYS]
  if (!gatewayConfig) {
    throw new Error("Invalid payment gateway")
  }

  const fee = (amount * gatewayConfig.fees.percentage / 100) + gatewayConfig.fees.fixed
  return {
    fee: Math.round(fee * 100) / 100, // Round to 2 decimal places
    total: amount + fee,
  }
}
