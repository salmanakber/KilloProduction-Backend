import { formatPhoneForTwilio } from "@/lib/phoneUtils"

const DEFAULT_COUNTRY = process.env.DEFAULT_PHONE_COUNTRY || "NG"

function parseList(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "")
}

function normalizePhone(phone: string): string | null {
  if (!phone?.trim()) return null
  try {
    return formatPhoneForTwilio(phone, DEFAULT_COUNTRY)
  } catch {
    const digits = phoneDigits(phone)
    return digits.length > 0 ? digits : null
  }
}

function phonesEquivalent(a: string, b: string): boolean {
  const na = normalizePhone(a)
  const nb = normalizePhone(b)
  if (!na || !nb) return false
  if (na === nb) return true

  const da = phoneDigits(na)
  const db = phoneDigits(nb)
  if (da.length >= 10 && db.length >= 10 && da.slice(-10) === db.slice(-10)) {
    return true
  }
  return false
}

function getBypassPhones(): string[] {
  return parseList(process.env.PLAYSTORE_REVIEW_OTP_BYPASS_PHONES)
}

function getBypassEmails(): string[] {
  return parseList(process.env.PLAYSTORE_REVIEW_OTP_BYPASS_EMAILS).map(normalizeEmail)
}

export function isPlaystoreReviewOtpBypassEnabled(): boolean {
  return getBypassPhones().length > 0 || getBypassEmails().length > 0
}

/**
 * Returns true when the login identifier matches a Play Store review allowlist entry.
 * Configure via:
 *   PLAYSTORE_REVIEW_OTP_BYPASS_PHONES=+2348012345678,+2348098765432
 *   PLAYSTORE_REVIEW_OTP_BYPASS_EMAILS=reviewer@example.com,playstore@kilo1app.com
 */
export function shouldBypassLoginOtp(args: {
  loginPhone?: string | null
  loginEmail?: string | null
  userPhone?: string | null
  userEmail?: string | null
}): boolean {
  const bypassPhones = getBypassPhones()
  const bypassEmails = getBypassEmails()
  if (bypassPhones.length === 0 && bypassEmails.length === 0) return false

  const candidatePhones = [args.loginPhone, args.userPhone].filter(
    (value): value is string => Boolean(value?.trim())
  )
  const candidateEmails = [args.loginEmail, args.userEmail]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeEmail)

  if (
    bypassPhones.some((allowed) =>
      candidatePhones.some((candidate) => phonesEquivalent(candidate, allowed))
    )
  ) {
    return true
  }

  if (bypassEmails.some((allowed) => candidateEmails.includes(allowed))) {
    return true
  }

  return false
}
