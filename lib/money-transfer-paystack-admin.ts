import { prisma } from "@/lib/prisma"

export async function getMoneyTransferPaystackSecretKey(): Promise<string> {
  const config = await prisma.moneyTransferConfig.findFirst({
    select: { paystackSecretKey: true },
  })
  if (config?.paystackSecretKey) return config.paystackSecretKey
  if (process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY) {
    return process.env.MONEY_TRANSFER_PAYSTACK_SECRET_KEY
  }
  throw new Error("Money Transfer Paystack configuration not found")
}

type PaystackApiResponse<T> = {
  status: boolean
  message: string
  data: T
}

export type PaystackBalanceRow = {
  currency: string
  balance: number
}

/** Paystack returns balance in subunits (kobo for NGN). */
export async function fetchPaystackIntegrationBalances(): Promise<{
  configured: boolean
  balances: Array<{ currency: string; balance: number; balanceMajor: number }>
  fetchedAt: string
}> {
  const secretKey = await getMoneyTransferPaystackSecretKey()
  const res = await fetch("https://api.paystack.co/balance", {
    headers: { Authorization: `Bearer ${secretKey}` },
    cache: "no-store",
  })
  const json = (await res.json()) as PaystackApiResponse<PaystackBalanceRow[]>
  if (!json.status) {
    throw new Error(json.message || "Failed to fetch Paystack balance")
  }
  const rows = Array.isArray(json.data) ? json.data : [json.data].filter(Boolean)
  return {
    configured: true,
    balances: rows.map((row) => {
      const currency = String(row.currency || "NGN").toUpperCase()
      const balance = Number(row.balance) || 0
      const divisor = currency === "NGN" ? 100 : 100
      return {
        currency,
        balance,
        balanceMajor: balance / divisor,
      }
    }),
    fetchedAt: new Date().toISOString(),
  }
}

export async function verifyPaystackTransfer(reference: string) {
  const secretKey = await getMoneyTransferPaystackSecretKey()
  const res = await fetch(
    `https://api.paystack.co/transfer/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` }, cache: "no-store" },
  )
  const json = await res.json()
  if (!json.status) {
    throw new Error(json.message || "Paystack transfer verification failed")
  }
  return json.data
}

export async function fetchPaystackTransaction(reference: string) {
  const secretKey = await getMoneyTransferPaystackSecretKey()
  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` }, cache: "no-store" },
  )
  const json = await res.json()
  if (!json.status) {
    throw new Error(json.message || "Paystack transaction verification failed")
  }
  return json.data
}
