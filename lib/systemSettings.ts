import { prisma } from "./prisma"

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

