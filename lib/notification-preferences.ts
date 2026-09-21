/**
 * Customer push personalization.
 * Master switch remains `UserSettings.pushNotifications`.
 * Categories gate optional / product pushes from the dispatch worker + app events.
 */

export const NOTIFICATION_PREF_KEYS = [
  "orders",
  "rides",
  "promotions",
  "health",
  "money",
  "property",
  "chat",
] as const

export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number]

export type NotificationPreferences = Record<NotificationPrefKey, boolean>

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  orders: true,
  rides: true,
  promotions: true,
  health: true,
  money: true,
  property: true,
  chat: true,
}

export function normalizeNotificationPreferences(
  raw: unknown
): NotificationPreferences {
  const base = { ...DEFAULT_NOTIFICATION_PREFERENCES }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const obj = raw as Record<string, unknown>
  for (const key of NOTIFICATION_PREF_KEYS) {
    if (typeof obj[key] === "boolean") base[key] = obj[key]
  }
  return base
}

/** Categories that should never be opt-out (account/security/system critical). */
const ALWAYS_ALLOW_TYPES = new Set([
  "SYSTEM",
])

/** Admin / security sources that bypass category toggles when master push is on. */
const ALWAYS_ALLOW_SOURCES = new Set([
  "admin_system_broadcast",
  "account_security",
  "kyc",
])

/**
 * Map NotificationType + Module (+ optional data.source) → preference key.
 * Returns null for always-allow (when master push is enabled).
 */
export function resolveNotificationPrefKey(params: {
  type?: string | null
  module?: string | null
  data?: any
}): NotificationPrefKey | null {
  const type = String(params.type || "").toUpperCase()
  const module = String(params.module || "").toUpperCase()
  const source = String(params.data?.source || "").toLowerCase()

  if (ALWAYS_ALLOW_SOURCES.has(source)) return null
  if (ALWAYS_ALLOW_TYPES.has(type) && module === "ADMIN") return null

  if (
    type === "PROMOTION" ||
    source.includes("marketing") ||
    source.includes("campaign") ||
    source.includes("special_offer")
  ) {
    return "promotions"
  }

  if (
    type === "CHAT_MESSAGE" ||
    type === "AUTO_PARTS_CHAT" ||
    type.includes("CHAT")
  ) {
    return "chat"
  }

  if (
    type === "MONEY_TRANSFER" ||
    type === "WALLET_UPDATE" ||
    type === "PAYMENT" ||
    module === "MONEY_TRANSFER" ||
    module === "WALLET" ||
    source.startsWith("ajo_") ||
    source.includes("ajo") ||
    source.includes("credit_") ||
    source.includes("vtpass")
  ) {
    return "money"
  }

  if (
    module === "PROPERTY" ||
    source.includes("property") ||
    source.includes("booking_reminder")
  ) {
    return "property"
  }

  if (
    type === "MEDICINE_REMINDER" ||
    type === "REMINDER" ||
    source.includes("health") ||
    source.includes("wellness") ||
    source.includes("pill") ||
    source.includes("diet") ||
    source.includes("walk")
  ) {
    // Health helpers use REMINDER; module often PHARMACY in legacy paths
    if (
      module === "PHARMACY" ||
      module === "CUSTOMER" ||
      !module ||
      source.includes("health") ||
      source.includes("wellness") ||
      source.includes("pill") ||
      source.includes("diet") ||
      source.includes("walk") ||
      type === "MEDICINE_REMINDER"
    ) {
      return "health"
    }
  }

  if (
    type === "RIDE" ||
    type === "COURIER_ACCEPTED" ||
    type === "BID_RECEIVED" ||
    type === "BID_ACCEPTED" ||
    module === "RIDING" ||
    module === "COURIER" ||
    source.includes("ride") ||
    source.includes("courier") ||
    source.includes("pickup_waiting")
  ) {
    return "rides"
  }

  if (
    type.includes("ORDER") ||
    type.includes("DELIVERY") ||
    type.includes("PRESCRIPTION") ||
    type.includes("AUTO_PARTS") ||
    type.includes("MECHANIC") ||
    type.includes("VENDOR") ||
    type === "QUOTE_ACCEPTED" ||
    type === "SERVICE_COMPLETED" ||
    module === "FOOD" ||
    module === "GROCERY" ||
    module === "PHARMACY" ||
    module === "AUTO_PARTS" ||
    module === "WHOLESALER"
  ) {
    return "orders"
  }

  if (type === "REVIEW_REQUEST" || type === "REVIEW_RECEIVED") {
    return "orders"
  }

  // Default optional product noise → promotions rather than forcing
  if (type === "SYSTEM" && module !== "ADMIN") {
    return "promotions"
  }

  return "orders"
}

export function isPushCategoryEnabled(
  prefs: unknown,
  key: NotificationPrefKey | null
): boolean {
  if (key === null) return true
  const normalized = normalizeNotificationPreferences(prefs)
  return normalized[key] !== false
}
