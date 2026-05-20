import Stripe from "stripe"
import { prisma } from "@/lib/prisma"

async function getMoneyStripe(): Promise<Stripe | null> {
  const config = await prisma.moneyTransferConfig.findFirst({
    select: { stripeSecretKey: true },
  })
  const key =
    config?.stripeSecretKey || process.env.MONEY_TRANSFER_STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key, { apiVersion: "2023-10-16" })
}

export async function fetchStripeMoneyBalances(): Promise<{
  configured: boolean
  balances: Array<{ currency: string; available: number; pending: number }>
  fetchedAt: string
  error?: string
}> {
  const stripe = await getMoneyStripe()
  if (!stripe) {
    return { configured: false, balances: [], fetchedAt: new Date().toISOString() }
  }
  try {
    const balance = await stripe.balance.retrieve()
    const byCurrency = new Map<string, { available: number; pending: number }>()

    for (const row of balance.available) {
      const c = row.currency.toUpperCase()
      const cur = byCurrency.get(c) || { available: 0, pending: 0 }
      cur.available += row.amount / 100
      byCurrency.set(c, cur)
    }
    for (const row of balance.pending) {
      const c = row.currency.toUpperCase()
      const cur = byCurrency.get(c) || { available: 0, pending: 0 }
      cur.pending += row.amount / 100
      byCurrency.set(c, cur)
    }

    return {
      configured: true,
      balances: [...byCurrency.entries()].map(([currency, v]) => ({
        currency,
        ...v,
      })),
      fetchedAt: new Date().toISOString(),
    }
  } catch (e) {
    return {
      configured: true,
      balances: [],
      fetchedAt: new Date().toISOString(),
      error: e instanceof Error ? e.message : "Stripe balance failed",
    }
  }
}
