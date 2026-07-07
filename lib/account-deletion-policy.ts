import {
  buildAppSchemeUrl,
  buildWebDeepLinkUrl,
  MOBILE_APP_SCHEME,
  WEB_ORIGIN,
} from "@/lib/mobile-app-link"

export const ACCOUNT_DELETION_RETENTION_DAYS = 30

export const ACCOUNT_DELETION_PATH = "/account-deletion"

export const ACCOUNT_DELETION_IN_APP_STEPS = [
  "Open the Kilo app and sign in to your account.",
  "Go to Account (profile tab).",
  "Tap Delete Account.",
  "Review the data that will be removed.",
  "Type DELETE to confirm, then tap Permanently Delete.",
] as const

export const ACCOUNT_DELETION_DATA_REMOVED = [
  "Profile information (name, email, phone, avatar)",
  "Order and booking history",
  "Saved addresses and payment preferences",
  "Wallet balance and loyalty points (forfeited on deletion)",
  "In-app messages tied to your account",
  "Health & fitness logs linked to your account",
] as const

export const ACCOUNT_DELETION_DATA_RETAINED = [
  "Records required by law, tax, or fraud-prevention obligations (if applicable)",
  "Anonymized analytics that cannot identify you",
  "Financial transaction audit logs retained for the legally required period before purge",
] as const

export function getAccountDeletionSupportEmail() {
  return process.env.SUPPORT_EMAIL?.trim() || "support@kilo1app.com"
}

export function getAccountDeletionPolicy() {
  const webUrl = buildWebDeepLinkUrl(ACCOUNT_DELETION_PATH)
  const appSchemeUrl = buildAppSchemeUrl(ACCOUNT_DELETION_PATH)

  return {
    appName: process.env.APP_NAME?.trim() || "Kilo",
    webUrl,
    apiUrl: `${WEB_ORIGIN.replace(/\/$/, "")}/api/account-deletion`,
    deepLinkPath: ACCOUNT_DELETION_PATH,
    appScheme: MOBILE_APP_SCHEME,
    appSchemeUrl,
    inAppScreen: "DeleteAccountCustomer",
    inAppNavigation: "Account → Delete Account",
    retentionDays: ACCOUNT_DELETION_RETENTION_DAYS,
    supportEmail: getAccountDeletionSupportEmail(),
    summary:
      "You can request account deletion in the Kilo app. Your account is disabled immediately and personal data is permanently purged after a 30-day retention window.",
    steps: [...ACCOUNT_DELETION_IN_APP_STEPS],
    dataDeleted: [...ACCOUNT_DELETION_DATA_REMOVED],
    dataRetained: [...ACCOUNT_DELETION_DATA_RETAINED],
    alternativeOption: {
      title: "Deactivate instead of delete",
      description:
        "You can temporarily deactivate your account from the same screen. Your data is preserved and you can contact support to reactivate.",
    },
  }
}
