/** Shared mobile deep-link constants (web fallback pages + universal links). */
export const MOBILE_APP_SCHEME = "kilosuperappv1"
export const ANDROID_PACKAGE = process.env.ANDROID_APP_PACKAGE_NAME || "com.kilo1app.system"
export const IOS_BUNDLE_ID = process.env.IOS_BUNDLE_ID || "com.kilo1app.system"
export const WEB_ORIGIN =
  process.env.NEXT_PUBLIC_APP_DEEP_LINK_ORIGIN?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  process.env.APP_URL?.replace(/\/$/, "") ||
  "https://app.kilo1app.com"

export function normalizeDeepLinkPath(path: string) {
  const trimmed = (path || "").trim()
  if (!trimmed) return "/"
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

export function buildWebDeepLinkUrl(path: string, search?: string) {
  const base = normalizeDeepLinkPath(path.split("?")[0])
  const query = search || (path.includes("?") ? path.split("?").slice(1).join("?") : "")
  return `${WEB_ORIGIN}${base}${query ? `?${query.replace(/^\?/, "")}` : ""}`
}

export function buildAppSchemeUrl(path: string, search?: string) {
  const pathPart = normalizeDeepLinkPath(path.split("?")[0]).replace(/^\//, "")
  const query = search || (path.includes("?") ? path.split("?").slice(1).join("?") : "")
  return `${MOBILE_APP_SCHEME}://${pathPart}${query ? `?${query.replace(/^\?/, "")}` : ""}`
}

export function buildAndroidIntentUrl(path: string, search?: string) {
  const webUrl = encodeURIComponent(buildWebDeepLinkUrl(path, search))
  const pathPart = normalizeDeepLinkPath(path.split("?")[0]).replace(/^\//, "")
  const query = search || (path.includes("?") ? path.split("?").slice(1).join("?") : "")
  const intentPath = `${pathPart}${query ? `?${query.replace(/^\?/, "")}` : ""}`
  return `intent://${intentPath}#Intent;scheme=${MOBILE_APP_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${webUrl};end`
}

export function propertyListingWebPath(listingId: string) {
  return `/property/listing/${encodeURIComponent(listingId)}`
}

export function propertyListingWebUrl(listingId: string) {
  return `${WEB_ORIGIN}${propertyListingWebPath(listingId)}`
}

export function propertyListingAppSchemeUrl(listingId: string) {
  return buildAppSchemeUrl(propertyListingWebPath(listingId))
}

export function propertyListingAndroidIntentUrl(listingId: string) {
  return buildAndroidIntentUrl(propertyListingWebPath(listingId))
}

export function accountDeletionWebPath() {
  return "/account-deletion"
}

export function accountDeletionWebUrl() {
  return buildWebDeepLinkUrl(accountDeletionWebPath())
}

export function accountDeletionAppSchemeUrl() {
  return buildAppSchemeUrl(accountDeletionWebPath())
}

export function isMobileUserAgent(userAgent: string | null | undefined) {
  if (!userAgent) return false
  return /android|iphone|ipad|ipod|mobile/i.test(userAgent)
}

/** All path prefixes served by web fallback + app deep link router. */
export const DEEP_LINK_PATH_PREFIXES = [
  "/pay",
  "/track/",
  "/property/",
  "/stays/",
  "/food/",
  "/grocery/",
  "/orders/",
  "/courier-bookings/",
  "/riding/",
  "/rider/",
  "/customer/riding/",
  "/pharmacy/",
  "/wholesaler/",
  "/chat/",
  "/support/",
  "/reviews",
  "/riderfeedback",
  "/money-app",
  "/auto-parts/",
  "/health-record",
  "/register",
  "/account-deletion",
]

/** Web fallback + universal link pages — no admin login required. */
export function isPublicDeepLinkPath(pathname: string): boolean {
  const path = (pathname || "/").split("?")[0] || "/"
  if (path.startsWith("/.well-known")) return true
  for (const prefix of DEEP_LINK_PATH_PREFIXES) {
    if (prefix.endsWith("/")) {
      if (path.startsWith(prefix)) return true
    } else if (path === prefix || path.startsWith(`${prefix}/`)) {
      return true
    }
  }
  return false
}
