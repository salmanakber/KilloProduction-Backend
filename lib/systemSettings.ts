import { prisma } from "./prisma"

/** Normalized company block for PDFs / statements (from `compnyinfo` JSON). */
export type CompanyDisplayForPdf = {
  brandTitle: string
  tagline: string
  addressLines: string[]
  contactEmail: string
  contactPhone: string
  website: string
  supportEmail: string
  supportPhone: string
}

export const DEFAULT_COMPANY_DISPLAY_FOR_PDF: CompanyDisplayForPdf = {
  brandTitle: "SuperKilo",
  tagline: "Money Transfer Services",
  addressLines: [],
  contactEmail: "support@superkilo.com",
  contactPhone: "",
  website: "",
  supportEmail: "support@superkilo.com",
  supportPhone: "",
}

/**
 * Parses `SystemSettings.compnyinfo` JSON (company + supportCenter + tts, etc.).
 */
export function parseCompnyInfoJson(
  compnyinfo: unknown,
  appNameFallback: string | null | undefined
): CompanyDisplayForPdf {
  const base = {
    ...DEFAULT_COMPANY_DISPLAY_FOR_PDF,
    brandTitle: (appNameFallback || DEFAULT_COMPANY_DISPLAY_FOR_PDF.brandTitle).trim(),
  }
  if (!compnyinfo || typeof compnyinfo !== "object") return base

  const root = compnyinfo as Record<string, unknown>
  const company = (root.company || {}) as Record<string, unknown>
  const contact = (company.contact || {}) as Record<string, unknown>
  const addr = (company.address || {}) as Record<string, unknown>
  const support = (root.supportCenter || {}) as Record<string, unknown>

  const name = typeof company.name === "string" ? company.name.trim() : ""
  const description = typeof company.description === "string" ? company.description.trim() : ""

  const street = typeof addr.street === "string" ? addr.street.trim() : ""
  const city = typeof addr.city === "string" ? addr.city.trim() : ""
  const state = typeof addr.state === "string" ? addr.state.trim() : ""
  const country = typeof addr.country === "string" ? addr.country.trim() : ""
  const postalCode = typeof addr.postalCode === "string" ? addr.postalCode.trim() : ""

  const lineCityState = [city, state].filter(Boolean).join(", ")
  const lineCountryZip = [country, postalCode].filter(Boolean).join(" ")

  const addressLines = [street, lineCityState, lineCountryZip].filter((l) => l.length > 0)

  const cEmail = typeof contact.email === "string" ? contact.email.trim() : ""
  const cPhone = typeof contact.phone === "string" ? contact.phone.trim() : ""
  const cWeb = typeof contact.website === "string" ? contact.website.trim() : ""

  const sEmail = typeof support.email === "string" ? support.email.trim() : ""
  const sPhone = typeof support.phone === "string" ? support.phone.trim() : ""

  return {
    brandTitle: name || base.brandTitle,
    tagline: description || base.tagline,
    addressLines: addressLines.length ? addressLines : base.addressLines,
    contactEmail: cEmail || base.contactEmail,
    contactPhone: cPhone || base.contactPhone,
    website: cWeb || base.website,
    supportEmail: sEmail || cEmail || base.supportEmail,
    supportPhone: sPhone || cPhone || base.supportPhone,
  }
}

/** Loads company info from DB for statement PDFs. */
export async function getCompanyInfoForStatementPdf(): Promise<CompanyDisplayForPdf> {
  const row = await prisma.systemSettings.findFirst({
    select: { compnyinfo: true, appName: true },
  })
  return parseCompnyInfoJson(row?.compnyinfo, row?.appName ?? null)
}

export async function systemSettings() {
  // IMPORTANT:
  // This helper is used inside server route handlers (e.g. `/api/tts/*`).
  // Using `fetch("/api/...")` here breaks in Node because relative URLs are invalid.
  // Always read from the database directly.
  const [systemSettings, defaultCurrency] = await Promise.all([
    prisma.systemSettings.findFirst() as any,
    prisma.currency.findFirst({
      where: { isDefault: true },
      select: { code: true, symbol: true },
    }) as any,
  ])
  const defaultTts = {
    baseUrl: process.env.TTS_BASE_URL || "http://209.97.132.83:8080",
    voice: process.env.TTS_VOICE || "en-GB-RyanNeural",
  }

  if(!systemSettings) {
    return {
      appName: process.env.APP_NAME || 'Killo Super App',
      appVersion: process.env.APP_VERSION || '1.0.0',
      timezone: process.env.TIMEZONE || 'Africa/Lagos',
      language: process.env.LANGUAGE || 'en-US',
      currency: defaultCurrency?.symbol || 'NGN',
      currencyCode: defaultCurrency?.code || 'NGN',
      dateFormat: process.env.DATE_FORMAT || 'DD/MM/YYYY',
      maintenanceMode: process.env.MAINTENANCE_MODE || false,
      maintenanceMessage: process.env.MAINTENANCE_MESSAGE || 'System is under maintenance. Please try again later.',
      passwordMinLength: process.env.PASSWORD_MIN_LENGTH || 8,
      passwordRequireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE || true,
      passwordRequireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE || true,
      passwordRequireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS || true,
      passwordRequireSpecialChars: process.env.PASSWORD_REQUIRE_SPECIAL_CHARS || true,
      tts: defaultTts,
    
    }
  }
  const savedTts = (systemSettings?.compnyinfo as any)?.tts
  return {
    ...systemSettings,
    currency: defaultCurrency?.symbol || 'NGN',
    tts: {
      baseUrl: savedTts?.baseUrl || defaultTts.baseUrl,
      voice: savedTts?.voice || defaultTts.voice,
    },
  }
}

