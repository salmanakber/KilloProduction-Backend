import { formatPhoneForTwilio } from "@/lib/phoneUtils"
import { sendViaTwilioWhatsappMedia, sendTransactionalSms } from "@/lib/twilio"
import {
  getMoneyReceiptWhatsappAccessToken,
  getMoneyReceiptWhatsappConfig,
  isMoneyReceiptWhatsappReady,
  isTwilioMessagingConfigured,
  renderReceiptWhatsappMessage,
} from "@/lib/money-receipt-whatsapp-config"

const DEFAULT_COUNTRY = process.env.DEFAULT_COUNTRY || "NG"

export type WhatsappSendMode = "template" | "session_document"

type MetaSendResponse = {
  messages?: Array<{ id: string }>
  error?: {
    message: string
    code?: number
    error_subcode?: number
    error_user_msg?: string
    error_user_title?: string
  }
}

/**
 * E.164 digits only (no +) — required by WhatsApp Cloud API `to` field.
 */
export function formatPhoneForWhatsAppCloud(phone: string): string {
  const e164 = formatPhoneForTwilio(phone, DEFAULT_COUNTRY)
  return e164.replace(/\D/g, "")
}

function graphApiUrl(apiVersion: string, phoneNumberId: string): string {
  const version = apiVersion.startsWith("v") ? apiVersion : `v${apiVersion}`
  return `https://graph.facebook.com/${version}/${phoneNumberId}/messages`
}

function mapMetaError(data: MetaSendResponse, status: number): string {
  const err = data.error
  const code = err?.code
  const base = err?.error_user_msg || err?.message || `WhatsApp API error (${status})`

  if (code === 131030) {
    return `${base} Add this phone number as a test recipient in Meta App Dashboard → WhatsApp → API Setup.`
  }
  if (code === 131047 || code === 131026) {
    return `${base} Business-initiated messages require an approved utility template. Set the template name in Admin → System Settings → Notifications (Money transfer receipts).`
  }
  if (code === 131051) {
    return `${base} Message type is not supported for this recipient.`
  }
  if (code === 100 || code === 190) {
    return `${base} Check your access token and Phone Number ID in admin settings.`
  }
  return base
}

async function verifyPdfUrlReachable(pdfUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pdfUrl, { method: "HEAD", signal: AbortSignal.timeout(12_000) })
    if (res.ok) return null
    return `Receipt PDF URL returned HTTP ${res.status}. Meta must be able to download the file over HTTPS.`
  } catch {
    return "Receipt PDF URL is not reachable. Ensure Cloudinary (or your host) allows public access."
  }
}

async function postToMeta(
  url: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data: MetaSendResponse; status: number }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as MetaSendResponse
  return { ok: res.ok, data, status: res.status }
}

async function sendTemplateDocument(args: {
  url: string
  accessToken: string
  to: string
  templateName: string
  templateLanguage: string
  pdfUrl: string
  filename: string
  bodyParams: string[]
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const components: Array<Record<string, unknown>> = [
    {
      type: "header",
      parameters: [
        {
          type: "document",
          document: {
            link: args.pdfUrl,
            filename: args.filename,
          },
        },
      ],
    },
  ]

  if (args.bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: args.bodyParams.map((text) => ({ type: "text", text })),
    })
  }

  const { ok, data, status } = await postToMeta(args.url, args.accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: args.to,
    type: "template",
    template: {
      name: args.templateName,
      language: { code: args.templateLanguage },
      components,
    },
  })

  if (!ok) {
    return { ok: false, error: mapMetaError(data, status) }
  }
  return { ok: true, messageId: data.messages?.[0]?.id }
}

async function sendSessionDocument(args: {
  url: string
  accessToken: string
  to: string
  pdfUrl: string
  filename: string
  caption: string
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const { ok, data, status } = await postToMeta(args.url, args.accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: args.to,
    type: "document",
    document: {
      link: args.pdfUrl,
      filename: args.filename,
      caption: args.caption.slice(0, 1024),
    },
  })

  if (!ok) {
    return { ok: false, error: mapMetaError(data, status) }
  }
  return { ok: true, messageId: data.messages?.[0]?.id }
}

/**
 * Send a PDF receipt via Meta WhatsApp Cloud API.
 * Uses an approved utility template when configured; otherwise session document (24h window).
 */
export async function sendMoneyReceiptWhatsapp(args: {
  toPhone: string
  pdfUrl: string
  reference: string
  amount: number
  currency: string
  customerName?: string
}): Promise<{
  ok: boolean
  error?: string
  messageId?: string
  mode?: WhatsappSendMode
  to?: string
  deliveryNote?: string
}> {
  const cfg = await getMoneyReceiptWhatsappConfig()
  const accessToken = await getMoneyReceiptWhatsappAccessToken()

  if (!isMoneyReceiptWhatsappReady(cfg, accessToken)) {
    if (!cfg.enabled) {
      return { ok: false, error: "WhatsApp receipt delivery is not enabled" }
    }
    if (!cfg.phoneNumberId) {
      return {
        ok: false,
        error: "WhatsApp Phone Number ID is not configured (Meta API Setup)",
      }
    }
    return {
      ok: false,
      error: "WhatsApp Cloud API access token is not configured",
    }
  }

  if (process.env.WHATSAPP_SEND_DISABLED === "true") {
    console.log("[whatsapp-meta] WHATSAPP_SEND_DISABLED — skipped", args.reference)
    return {
      ok: false,
      error: "WhatsApp sending is disabled on this server (WHATSAPP_SEND_DISABLED=true)",
    }
  }

  let to: string
  try {
    to = formatPhoneForWhatsAppCloud(args.toPhone)
  } catch {
    return { ok: false, error: "Invalid customer phone number for WhatsApp" }
  }

  const pdfCheck = await verifyPdfUrlReachable(args.pdfUrl)
  if (pdfCheck) {
    return { ok: false, error: pdfCheck }
  }

  const caption = renderReceiptWhatsappMessage(cfg.messageTemplate, {
    reference: args.reference,
    amount: args.amount.toFixed(2),
    currency: args.currency,
    name: args.customerName,
  })

  const filename = `receipt_${args.reference.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`
  const url = graphApiUrl(cfg.apiVersion, cfg.phoneNumberId)

  const templateName = cfg.templateName?.trim()
  const templateLanguage = cfg.templateLanguage?.trim() || "en"

  try {
    if (templateName) {
      const bodyParams = [
        args.reference,
        `${args.amount.toFixed(2)} ${args.currency}`,
        args.customerName || "Customer",
      ].slice(0, 10)

      const templateResult = await sendTemplateDocument({
        url,
        accessToken,
        to,
        templateName,
        templateLanguage,
        pdfUrl: args.pdfUrl,
        filename,
        bodyParams,
      })

      if (templateResult.ok) {
        return {
          ok: true,
          messageId: templateResult.messageId,
          mode: "template",
          to,
          deliveryNote:
            "Sent via approved template. Delivery status is confirmed by Meta webhooks.",
        }
      }
      return { ok: false, error: templateResult.error, mode: "template", to }
    }

    const sessionResult = await sendSessionDocument({
      url,
      accessToken,
      to,
      pdfUrl: args.pdfUrl,
      filename,
      caption,
    })

    if (sessionResult.ok) {
      return {
        ok: true,
        messageId: sessionResult.messageId,
        mode: "session_document",
        to,
        deliveryNote:
          "Sent as a session message (works within 24h after the customer messages your business number). For cold receipts, configure a utility template in admin.",
      }
    }

    return { ok: false, error: sessionResult.error, mode: "session_document", to }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "WhatsApp send failed"
    console.error("[whatsapp-meta]", message)
    return { ok: false, error: message, to }
  }
}

export type ReceiptSmartDeliveryMode = "meta_whatsapp" | "twilio_whatsapp" | "sms"

/**
 * Try Meta WhatsApp Cloud first when configured; otherwise or on failure, try Twilio WhatsApp (PDF),
 * then SMS with a link (uses your configured SMS provider — Twilio when selected).
 */
export async function sendMoneyReceiptWithSmartDelivery(args: {
  toPhone: string
  pdfUrl: string
  reference: string
  amount: number
  currency: string
  customerName?: string
}): Promise<{
  ok: boolean
  error?: string
  messageId?: string
  mode?: WhatsappSendMode | ReceiptSmartDeliveryMode
  to?: string
  deliveryNote?: string
}> {
  const cfg = await getMoneyReceiptWhatsappConfig()
  if (!cfg.enabled) {
    return { ok: false, error: "WhatsApp receipt delivery is not enabled" }
  }

  const accessToken = await getMoneyReceiptWhatsappAccessToken()
  const metaReady = isMoneyReceiptWhatsappReady(cfg, accessToken)

  let metaError: string | undefined
  if (metaReady) {
    const meta = await sendMoneyReceiptWhatsapp(args)
    if (meta.ok) {
      return { ...meta, mode: "meta_whatsapp" as const }
    }
    metaError = meta.error
  }

  const caption = renderReceiptWhatsappMessage(cfg.messageTemplate, {
    reference: args.reference,
    amount: args.amount.toFixed(2),
    currency: args.currency,
    name: args.customerName,
  })

  const twilioMessaging = await isTwilioMessagingConfigured()
  if (twilioMessaging) {
    const tw = await sendViaTwilioWhatsappMedia({
      phone: args.toPhone,
      body: caption,
      mediaUrl: args.pdfUrl,
    })
    if (tw.ok) {
      return {
        ok: true,
        mode: "twilio_whatsapp",
        deliveryNote:
          "Sent via Twilio WhatsApp with PDF. Your Twilio sender must be WhatsApp-enabled.",
      }
    }

    const smsBody = `${caption}\nReceipt PDF: ${args.pdfUrl}`
    const smsSent = await sendTransactionalSms(args.toPhone, smsBody)
    if (smsSent) {
      return {
        ok: true,
        mode: "sms",
        deliveryNote:
          metaError
            ? `Meta WhatsApp: ${metaError}. Sent receipt link by SMS instead.`
            : "Sent receipt link by SMS (WhatsApp was not available).",
      }
    }
  }

  return {
    ok: false,
    error:
      metaError ||
      (twilioMessaging
        ? "Could not deliver receipt via WhatsApp or SMS."
        : "Configure Meta Cloud API (Phone Number ID + token) or Twilio in System Settings → Notifications."),
  }
}
