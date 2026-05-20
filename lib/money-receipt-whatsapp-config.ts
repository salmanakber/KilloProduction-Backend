import { prisma } from "@/lib/prisma"

/** WhatsApp Business Platform — Cloud API (Meta), not Twilio. */
export type MoneyReceiptWhatsappConfig = {
  enabled: boolean
  provider: "meta_cloud"
  /** Business phone number ID from Meta API Setup */
  phoneNumberId: string
  /** Graph API version, e.g. v21.0 */
  apiVersion: string
  /** Optional WABA ID for admin reference */
  wabaId: string | null
  /** Document caption / message body template (session messages) */
  messageTemplate: string
  /** Approved Meta utility template name (document header). Required for outbound receipts outside 24h window. */
  templateName: string | null
  templateLanguage: string
}

export type MoneyReceiptWhatsappConfigPublic = MoneyReceiptWhatsappConfig & {
  hasAccessToken: boolean
}

const DEFAULT_TEMPLATE =
  "Your SuperKillo money transfer receipt for {{reference}}. Amount: {{amount}} {{currency}}."

async function readMeta(): Promise<Record<string, unknown>> {
  const ss = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: { moneyReceiptWhatsapp: true },
  })
  const stored = ss?.moneyReceiptWhatsapp
  if (
    stored &&
    typeof stored === "object" &&
    !Array.isArray(stored) &&
    Object.keys(stored as object).length > 0
  ) {
    return stored as Record<string, unknown>
  }

  const config = await prisma.moneyTransferConfig.findFirst()
  const meta = (config?.metadata as Record<string, unknown>) || {}
  return (meta.receiptWhatsapp as Record<string, unknown>) || {}
}

export async function getMoneyReceiptWhatsappAccessToken(
  stored?: Record<string, unknown>,
): Promise<string> {
  const wa = stored ?? (await readMeta())
  const fromDb = String(wa.accessToken || "").trim()
  if (fromDb) return fromDb
  return String(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || "").trim()
}

export async function getMoneyReceiptWhatsappConfig(): Promise<MoneyReceiptWhatsappConfig> {
  const wa = await readMeta()

  return {
    enabled: Boolean(wa.enabled),
    provider: "meta_cloud",
    phoneNumberId: String(
      wa.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    ).trim(),
    apiVersion: String(wa.apiVersion || process.env.WHATSAPP_API_VERSION || "v21.0").trim(),
    wabaId: wa.wabaId ? String(wa.wabaId) : process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null,
    messageTemplate: String(wa.messageTemplate || DEFAULT_TEMPLATE),
    templateName: wa.templateName
      ? String(wa.templateName).trim()
      : process.env.WHATSAPP_RECEIPT_TEMPLATE_NAME?.trim() || null,
    templateLanguage:
      String(wa.templateLanguage || process.env.WHATSAPP_RECEIPT_TEMPLATE_LANGUAGE || "en").trim() ||
      "en",
  }
}

export async function getMoneyReceiptWhatsappConfigPublic(): Promise<MoneyReceiptWhatsappConfigPublic> {
  const wa = await readMeta()
  const cfg = await getMoneyReceiptWhatsappConfig()
  const token = await getMoneyReceiptWhatsappAccessToken(wa)
  return {
    ...cfg,
    hasAccessToken: Boolean(token),
  }
}

export function isMoneyReceiptWhatsappReady(cfg: MoneyReceiptWhatsappConfig, token: string): boolean {
  return cfg.enabled && Boolean(cfg.phoneNumberId) && Boolean(token)
}

/** True when Twilio env / system settings has SID, token, and sender (SMS or WhatsApp). */
export async function isTwilioMessagingConfigured(): Promise<boolean> {
  const ss = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: { twilioAccountSid: true, twilioAuthToken: true, twilioPhoneNumber: true },
  })
  const sid = ss?.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID
  const token = ss?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN
  const from = ss?.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER
  return Boolean(sid && token && from)
}

/**
 * User can request a receipt when feature is enabled and at least one channel can deliver
 * (Meta Cloud, Twilio WhatsApp, or SMS via Twilio when Twilio is the SMS provider).
 */
export async function isMoneyReceiptDeliveryAvailable(): Promise<boolean> {
  const cfg = await getMoneyReceiptWhatsappConfig()
  if (!cfg.enabled) return false
  const token = await getMoneyReceiptWhatsappAccessToken()
  if (isMoneyReceiptWhatsappReady(cfg, token)) return true
  return isTwilioMessagingConfigured()
}

export async function saveMoneyReceiptWhatsappConfig(patch: {
  enabled?: boolean
  phoneNumberId?: string
  accessToken?: string | null
  apiVersion?: string
  wabaId?: string | null
  messageTemplate?: string
  templateName?: string | null
  templateLanguage?: string
}): Promise<MoneyReceiptWhatsappConfigPublic> {
  const prev = await readMeta()
  const current = await getMoneyReceiptWhatsappConfig()

  const nextWa: Record<string, unknown> = {
    ...prev,
    provider: "meta_cloud",
    enabled: patch.enabled !== undefined ? patch.enabled : current.enabled,
    phoneNumberId:
      patch.phoneNumberId !== undefined ? patch.phoneNumberId : current.phoneNumberId,
    apiVersion: patch.apiVersion !== undefined ? patch.apiVersion : current.apiVersion,
    wabaId: patch.wabaId !== undefined ? patch.wabaId : current.wabaId,
    messageTemplate:
      patch.messageTemplate !== undefined ? patch.messageTemplate : current.messageTemplate,
    templateName:
      patch.templateName !== undefined ? patch.templateName : current.templateName,
    templateLanguage:
      patch.templateLanguage !== undefined
        ? patch.templateLanguage
        : current.templateLanguage,
  }

  if (patch.accessToken !== undefined && patch.accessToken !== null && String(patch.accessToken).trim()) {
    nextWa.accessToken = String(patch.accessToken).trim()
  }

  await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: { moneyReceiptWhatsapp: nextWa as object },
    create: { id: 1, moneyReceiptWhatsapp: nextWa as object },
  })

  return getMoneyReceiptWhatsappConfigPublic()
}

export function renderReceiptWhatsappMessage(
  template: string,
  data: { reference: string; amount: string; currency: string; name?: string },
): string {
  return template
    .replace(/\{\{reference\}\}/g, data.reference)
    .replace(/\{\{amount\}\}/g, data.amount)
    .replace(/\{\{currency\}\}/g, data.currency)
    .replace(/\{\{name\}\}/g, data.name || "Customer")
}
