import { prisma } from "@/lib/prisma"
import { randomBytes } from "crypto"

export type VtpassServiceType = "airtime" | "data" | "electricity" | "cable"

export const VTPASS_AIRTIME_SERVICES = [
  { id: "mtn", name: "MTN" },
  { id: "airtel", name: "Airtel" },
  { id: "glo", name: "Glo" },
  { id: "etisalat", name: "9mobile" },
] as const

export const VTPASS_DATA_SERVICES = [
  { id: "mtn-data", name: "MTN Data" },
  { id: "airtel-data", name: "Airtel Data" },
  { id: "glo-data", name: "Glo Data" },
  { id: "etisalat-data", name: "9mobile Data" },
] as const

export const VTPASS_CABLE_SERVICES = [
  { id: "dstv", name: "DSTV" },
  { id: "gotv", name: "GOTV" },
  { id: "startimes", name: "Startimes" },
] as const

export const VTPASS_ELECTRICITY_SERVICES = [
  { id: "ikeja-electric", name: "Ikeja Electric" },
  { id: "eko-electric", name: "Eko Electric" },
  { id: "ibadan-electric", name: "Ibadan Electric" },
  { id: "abuja-electric", name: "Abuja Electric" },
] as const

export async function getVtpassConfig() {
  let row = await prisma.vtpassConfig.findUnique({ where: { id: "default" } })
  if (!row) {
    row = await prisma.vtpassConfig.create({ data: { id: "default" } })
  }
  return row
}

function baseUrl(sandbox: boolean) {
  return sandbox ? "https://sandbox.vtpass.com/api" : "https://vtpass.com/api"
}

function authHeaders(apiKey: string, secretKey: string) {
  return {
    "api-key": apiKey,
    "secret-key": secretKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  }
}

export function generateVtpassRequestId(): string {
  return `sk_${Date.now()}_${randomBytes(6).toString("hex")}`
}

export async function fetchVtpassWalletBalance(): Promise<{
  configured: boolean
  balance: number | null
  currency: string
  raw?: unknown
  error?: string
}> {
  const config = await getVtpassConfig()
  if (!config.apiKey || !config.secretKey) {
    return { configured: false, balance: null, currency: "NGN" }
  }
  try {
    const res = await fetch(`${baseUrl(config.sandbox)}/balance`, {
      headers: authHeaders(config.apiKey, config.secretKey),
    })
    const json = await res.json()
    const contents = json?.contents ?? json?.content ?? json
    const bal = Number(contents?.balance ?? contents?.wallet_balance ?? 0)
    return {
      configured: true,
      balance: Number.isFinite(bal) ? bal : null,
      currency: "NGN",
      raw: json,
    }
  } catch (e) {
    return {
      configured: true,
      balance: null,
      currency: "NGN",
      error: e instanceof Error ? e.message : "VTpass balance failed",
    }
  }
}

export async function fetchVtpassVariations(serviceId: string) {
  const config = await getVtpassConfig()
  if (!config.apiKey || !config.secretKey) {
    throw new Error("VTpass is not configured")
  }
  const res = await fetch(
    `${baseUrl(config.sandbox)}/service-variations?serviceID=${encodeURIComponent(serviceId)}`,
    { headers: authHeaders(config.apiKey, config.secretKey) },
  )
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.response_description || json?.message || "Failed to load plans")
  }
  const variations = json?.content?.variations ?? json?.content?.varations ?? []
  return Array.isArray(variations) ? variations : []
}

export function computeVtpassCommission(
  amount: number,
  serviceType: VtpassServiceType,
  config: { airtimeCommissionPct: number; dataCommissionPct: number; billsCommissionPct: number },
): number {
  const pct =
    serviceType === "airtime"
      ? config.airtimeCommissionPct
      : serviceType === "data"
        ? config.dataCommissionPct
        : config.billsCommissionPct
  return Math.round(amount * (pct / 100) * 100) / 100
}

export async function executeVtpassPayment(args: {
  serviceId: string
  serviceType: VtpassServiceType
  billersCode: string
  amount: number
  phone?: string
  variationCode?: string
  requestId?: string
}) {
  const config = await getVtpassConfig()
  if (!config.isEnabled || !config.apiKey || !config.secretKey) {
    throw new Error("VTpass payments are not enabled")
  }

  const request_id = args.requestId || generateVtpassRequestId()
  const payload: Record<string, unknown> = {
    request_id,
    serviceID: args.serviceId,
    billersCode: args.billersCode,
    amount: args.amount,
  }
  if (args.phone) payload.phone = args.phone
  if (args.variationCode) payload.variation_code = args.variationCode

  const res = await fetch(`${baseUrl(config.sandbox)}/pay`, {
    method: "POST",
    headers: authHeaders(config.apiKey, config.secretKey),
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  const code = String(json?.code ?? json?.response_code ?? "")
  const delivered =
    code === "000" ||
    json?.content?.transactions?.status === "delivered" ||
    json?.content?.status === "delivered"

  return {
    requestId: request_id,
    delivered,
    response: json,
    reference:
      json?.content?.transactions?.transactionId ||
      json?.requestId ||
      json?.content?.requestId ||
      request_id,
    message: json?.response_description || json?.message,
  }
}
