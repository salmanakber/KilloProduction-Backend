import { prisma } from "@/lib/prisma"
import { randomBytes } from "crypto"

export type VtpassServiceType =
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "education"
  | "insurance"

export const VTPASS_AIRTIME_SERVICES = [
  { id: "mtn", name: "MTN Airtime VTU" },
  { id: "airtel", name: "Airtel Airtime VTU" },
  { id: "glo", name: "GLO Airtime VTU" },
  { id: "etisalat", name: "9mobile Airtime VTU" },
  { id: "foreign-airtime", name: "International Airtime" },
] as const

export const VTPASS_DATA_SERVICES = [
  { id: "mtn-data", name: "MTN Data" },
  { id: "airtel-data", name: "Airtel Data" },
  { id: "glo-data", name: "GLO Data" },
  { id: "etisalat-data", name: "9mobile Data" },
  { id: "smile-direct", name: "Smile Payment" },
  { id: "spectranet", name: "Spectranet Internet Data" },
  { id: "glo-sme-data", name: "GLO Data (SME)" },
  { id: "9mobile-sme-data", name: "9mobile SME Data" },
] as const

export const VTPASS_CABLE_SERVICES = [
  { id: "dstv", name: "DSTV" },
  { id: "gotv", name: "GOTV" },
  { id: "startimes", name: "Startimes" },
  { id: "showmax", name: "Showmax" },
] as const

export const VTPASS_ELECTRICITY_SERVICES = [
  { id: "ikeja-electric", name: "Ikeja Electric (IKEDC)" },
  { id: "eko-electric", name: "Eko Electric (EKEDC)" },
  { id: "abuja-electric", name: "Abuja Electric (AEDC)" },
  { id: "kano-electric", name: "Kano Electric (KEDCO)" },
  { id: "portharcourt-electric", name: "Port Harcourt (PHED)" },
  { id: "jos-electric", name: "Jos Electric (JED)" },
  { id: "kaduna-electric", name: "Kaduna Electric (KAEDCO)" },
  { id: "enugu-electric", name: "Enugu Electric (EEDC)" },
  { id: "ibadan-electric", name: "Ibadan Electric (IBEDC)" },
  { id: "benin-electric", name: "Benin Electric (BEDC)" },
  { id: "aba-electric", name: "Aba Electric (ABEDC)" },
  { id: "yola-electric", name: "Yola Electric (YEDC)" },
] as const

export const VTPASS_EDUCATION_SERVICES = [
  { id: "waec", name: "WAEC Result Checker PIN" },
  { id: "waec-registration", name: "WAEC Registration PIN" },
  { id: "jamb", name: "JAMB PIN (UTME & Direct Entry)" },
] as const

export const VTPASS_INSURANCE_SERVICES = [
  { id: "ui-insure", name: "Third Party Motor Insurance" },
  { id: "personal-accident-insurance", name: "Personal Accident Insurance" },
] as const

export async function getVtpassConfig() {
  let row = await prisma.vtpassConfig.findUnique({ where: { id: "default" } })
  if (!row) {
    row = await prisma.vtpassConfig.create({ data: { id: "default" } })
  }
  return row
}

type VtpassCredentials = {
  apiKey: string
  publicKey: string
  secretKey: string
}

export function isVtpassConfigured(config: {
  apiKey: string | null
  publicKey: string | null
  secretKey: string | null
}): boolean {
  return Boolean(config.apiKey?.trim() && config.publicKey?.trim() && config.secretKey?.trim())
}

function vtpassCredentials(config: {
  apiKey: string | null
  publicKey: string | null
  secretKey: string | null
}): VtpassCredentials | null {
  if (!isVtpassConfigured(config)) return null
  return {
    apiKey: config.apiKey!.trim(),
    publicKey: config.publicKey!.trim(),
    secretKey: config.secretKey!.trim(),
  }
}

function baseUrl(sandbox: boolean) {
  return sandbox ? "https://sandbox.vtpass.com/api" : "https://vtpass.com/api"
}

/** GET requests: api-key + public-key (per VTpass docs). */
function vtpassGetHeaders(creds: VtpassCredentials) {
  return {
    "api-key": creds.apiKey,
    "public-key": creds.publicKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  }
}

/** POST requests: api-key + secret-key (per VTpass docs). */
function vtpassPostHeaders(creds: VtpassCredentials) {
  return {
    "api-key": creds.apiKey,
    "secret-key": creds.secretKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  }
}

export function generateVtpassRequestId(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date())

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00"

  // VTpass requires first 12 chars = YYYYMMDDHHII (Africa/Lagos), then optional suffix.
  const prefix = `${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}`
  return `${prefix}${randomBytes(5).toString("hex")}`
}

export function normalizeVtpassPhone(input: string): string {
  const digits = input.replace(/\D/g, "")
  if (digits.startsWith("234") && digits.length >= 13) return `0${digits.slice(3)}`
  if (digits.startsWith("0")) return digits
  if (digits.length === 10) return `0${digits}`
  return input.trim()
}

function buildVtpassPayPayload(args: {
  serviceId: string
  serviceType: VtpassServiceType
  billersCode: string
  amount: number
  phone?: string
  variationCode?: string
  requestId: string
  extraFields?: Record<string, string>
}) {
  const phone = normalizeVtpassPhone(args.phone || args.billersCode)
  const payload: Record<string, unknown> = {
    request_id: args.requestId,
    serviceID: args.serviceId,
    amount: args.amount,
  }

  if (args.serviceType === "airtime") {
    if (args.serviceId === "foreign-airtime") {
      payload.billersCode = phone
      payload.phone = phone
      if (args.variationCode) payload.variation_code = args.variationCode
      if (args.extraFields) {
        for (const [k, v] of Object.entries(args.extraFields)) {
          if (v) payload[k] = v
        }
      }
    } else {
      payload.phone = phone
    }
  } else if (args.serviceType === "data") {
    payload.billersCode = phone
    payload.phone = phone
    if (args.variationCode) payload.variation_code = args.variationCode
  } else {
    payload.billersCode = args.billersCode.trim()
    if (phone) payload.phone = phone
    if (args.variationCode) payload.variation_code = args.variationCode
    if (args.extraFields) {
      for (const [k, v] of Object.entries(args.extraFields)) {
        if (v) payload[k] = v
      }
    }
  }

  return payload
}

export async function fetchVtpassWalletBalance(): Promise<{
  configured: boolean
  balance: number | null
  currency: string
  sandbox?: boolean
  raw?: unknown
  error?: string
}> {
  const config = await getVtpassConfig()
  const creds = vtpassCredentials(config)
  if (!creds) {
    return { configured: false, balance: null, currency: "NGN" }
  }
  try {
    const res = await fetch(`${baseUrl(config.sandbox)}/balance`, {
      headers: vtpassGetHeaders(creds),
      cache: "no-store",
    })
    const json = await res.json()
    if (!res.ok) {
      return {
        configured: true,
        balance: null,
        currency: "NGN",
        sandbox: config.sandbox,
        error: json?.response_description || json?.message || `VTpass balance HTTP ${res.status}`,
        raw: json,
      }
    }
    const contents = json?.contents ?? json?.content ?? json
    const bal = Number(contents?.balance ?? contents?.wallet_balance ?? 0)
    const code = String(json?.code ?? json?.response_description ?? "")
    if (code && code !== "000" && code !== "0" && !Number.isFinite(bal)) {
      return {
        configured: true,
        balance: null,
        currency: "NGN",
        sandbox: config.sandbox,
        error: json?.response_description || json?.message || "VTpass balance unavailable",
        raw: json,
      }
    }
    return {
      configured: true,
      balance: Number.isFinite(bal) ? bal : null,
      currency: "NGN",
      sandbox: config.sandbox,
      raw: json,
    }
  } catch (e) {
    return {
      configured: true,
      balance: null,
      currency: "NGN",
      sandbox: config.sandbox,
      error: e instanceof Error ? e.message : "VTpass balance failed",
    }
  }
}

export async function fetchVtpassVariations(
  serviceId: string,
  opts?: { operatorId?: string; productTypeId?: string },
) {
  const config = await getVtpassConfig()
  const creds = vtpassCredentials(config)
  if (!creds) {
    throw new Error("VTpass is not configured")
  }
  const params = new URLSearchParams({ serviceID: serviceId })
  if (opts?.operatorId) params.set("operator_id", opts.operatorId)
  if (opts?.productTypeId) params.set("product_type_id", opts.productTypeId)

  const res = await fetch(`${baseUrl(config.sandbox)}/service-variations?${params}`, {
    headers: vtpassGetHeaders(creds),
    cache: "no-store",
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.response_description || json?.message || "Failed to load plans")
  }
  const variations = json?.content?.variations ?? json?.content?.varations ?? []
  return Array.isArray(variations) ? variations : []
}

export async function fetchVtpassInternationalCountries() {
  const config = await getVtpassConfig()
  const creds = vtpassCredentials(config)
  if (!creds) throw new Error("VTpass is not configured")

  const res = await fetch(`${baseUrl(config.sandbox)}/get-international-airtime-countries`, {
    headers: vtpassGetHeaders(creds),
    cache: "no-store",
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.response_description || json?.message || "Failed to load countries")
  }
  const countries = json?.content?.countries ?? []
  return Array.isArray(countries) ? countries : []
}

export async function fetchVtpassInternationalProductTypes(countryCode: string) {
  const config = await getVtpassConfig()
  const creds = vtpassCredentials(config)
  if (!creds) throw new Error("VTpass is not configured")

  const res = await fetch(
    `${baseUrl(config.sandbox)}/get-international-airtime-product-types?code=${encodeURIComponent(countryCode)}`,
    { headers: vtpassGetHeaders(creds), cache: "no-store" },
  )
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.response_description || json?.message || "Failed to load product types")
  }
  const types = json?.content ?? []
  return Array.isArray(types) ? types : []
}

export async function fetchVtpassInternationalOperators(countryCode: string, productTypeId: string) {
  const config = await getVtpassConfig()
  const creds = vtpassCredentials(config)
  if (!creds) throw new Error("VTpass is not configured")

  const params = new URLSearchParams({
    code: countryCode,
    product_type_id: productTypeId,
  })
  const res = await fetch(
    `${baseUrl(config.sandbox)}/get-international-airtime-operators?${params}`,
    { headers: vtpassGetHeaders(creds), cache: "no-store" },
  )
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.response_description || json?.message || "Failed to load operators")
  }
  const operators = json?.content ?? []
  return Array.isArray(operators) ? operators : []
}

export async function fetchVtpassInsuranceOptions(
  kind: "color" | "engine-capacity" | "state" | "brand" | "lga" | "model",
  code?: string,
) {
  const config = await getVtpassConfig()
  const creds = vtpassCredentials(config)
  if (!creds) throw new Error("VTpass is not configured")

  const path =
    kind === "lga"
      ? `/universal-insurance/options/lga/${encodeURIComponent(code || "")}`
      : kind === "model"
        ? `/universal-insurance/options/model/${encodeURIComponent(code || "")}`
        : `/universal-insurance/options/${kind === "brand" ? "brand" : kind}`

  const res = await fetch(`${baseUrl(config.sandbox)}${path}`, {
    headers: vtpassGetHeaders(creds),
    cache: "no-store",
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.response_description || json?.message || "Failed to load insurance options")
  }
  const content = json?.content ?? []
  return Array.isArray(content) ? content : []
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
  extraFields?: Record<string, string>
}) {
  const config = await getVtpassConfig()
  const creds = vtpassCredentials(config)
  if (!config.isEnabled || !creds) {
    throw new Error("VTpass payments are not enabled")
  }

  const request_id = args.requestId || generateVtpassRequestId()
  const payload = buildVtpassPayPayload({ ...args, requestId: request_id })

  const res = await fetch(`${baseUrl(config.sandbox)}/pay`, {
    method: "POST",
    headers: vtpassPostHeaders(creds),
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
