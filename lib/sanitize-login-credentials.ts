/**
 * Hardens login credentials against Play Console / clipboard paste issues:
 * invisible Unicode, NBSP, BOM, zero-width chars, leading/trailing spaces,
 * and email typed into the phone field (app defaults to Phone tab).
 */

const INVISIBLE_OR_SPACE_RE =
  /[\u0000-\u001F\u007F\u00A0\u1680\u2000-\u200F\u2028-\u202F\u205F\u2060\u3000\uFEFF\u180E]/g

/** Soft hyphen, word joiner, bidi marks often introduced by copy from docs/HTML */
const EXTRA_INVISIBLE_RE = /[\u00AD\u200B-\u200D\u2066-\u2069]/g

export type SanitizedLoginCredentials = {
  email?: string
  phone?: string
  password: string
  passwordRaw: string
  passwordRawLength: number
  sanitization: {
    emailTrimmed: boolean
    phoneTrimmed: boolean
    passwordTrimmed: boolean
    passwordHadInvisibleChars: boolean
    emailHadInvisibleChars: boolean
    phoneHadInvisibleChars: boolean
    swappedPhoneToEmail: boolean
    swappedEmailToPhone: boolean
    passwordChanged: boolean
    identifierChanged: boolean
  }
}

function stripInvisible(value: string): { value: string; changed: boolean } {
  const next = value.replace(INVISIBLE_OR_SPACE_RE, " ").replace(EXTRA_INVISIBLE_RE, "")
  return { value: next, changed: next !== value }
}

/** For passwords: remove invisible/bidi/NBSP entirely (do not turn into regular spaces). */
function stripInvisibleFromPassword(value: string): { value: string; changed: boolean } {
  const next = value
    .replace(INVISIBLE_OR_SPACE_RE, "")
    .replace(EXTRA_INVISIBLE_RE, "")
  return { value: next, changed: next !== value }
}

function looksLikeEmail(value: string): boolean {
  return value.includes("@")
}

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "")
  return digits.length >= 8 && !value.includes("@")
}

/**
 * Normalize phone for DB lookup: strip spaces/dashes/parens; keep leading +.
 * Also return digit-only and last-10 variants for OR matching.
 */
export function phoneLookupVariants(phone: string): string[] {
  const cleaned = phone.replace(/[\s\-().]/g, "")
  const digits = cleaned.replace(/\D/g, "")
  const variants = new Set<string>()
  if (cleaned) variants.add(cleaned)
  if (phone.trim()) variants.add(phone.trim())
  if (digits) {
    variants.add(digits)
    if (!cleaned.startsWith("+") && digits.length >= 10) {
      variants.add(`+${digits}`)
    }
    if (digits.length >= 10) {
      variants.add(digits.slice(-10))
    }
  }
  return [...variants].filter(Boolean)
}

export function sanitizeLoginCredentials(body: {
  email?: unknown
  phone?: unknown
  password?: unknown
}): SanitizedLoginCredentials {
  const emailRaw = typeof body.email === "string" ? body.email : ""
  const phoneRaw = typeof body.phone === "string" ? body.phone : ""
  const passwordRaw = typeof body.password === "string" ? body.password : ""

  const emailInv = stripInvisible(emailRaw)
  const phoneInv = stripInvisible(phoneRaw)
  const passwordInv = stripInvisibleFromPassword(passwordRaw)

  let email = emailInv.value.trim()
  let phone = phoneInv.value.trim()
  // Password: remove invisible chars + trim edges only (keep intentional internal spaces)
  const password = passwordInv.value.trim()

  const sanitization = {
    emailTrimmed: emailRaw.trim() !== emailRaw || emailInv.changed,
    phoneTrimmed: phoneRaw.trim() !== phoneRaw || phoneInv.changed,
    passwordTrimmed: passwordRaw.trim() !== passwordRaw,
    passwordHadInvisibleChars: passwordInv.changed,
    emailHadInvisibleChars: emailInv.changed,
    phoneHadInvisibleChars: phoneInv.changed,
    swappedPhoneToEmail: false,
    swappedEmailToPhone: false,
    passwordChanged: false,
    identifierChanged: false,
  }

  // Play reviewers often stay on Phone tab and paste the review email there
  if (!email && phone && looksLikeEmail(phone)) {
    email = phone.trim()
    phone = ""
    sanitization.swappedPhoneToEmail = true
  }

  // Opposite mistake: email field used with a phone number
  if (!phone && email && looksLikePhone(email) && !looksLikeEmail(email)) {
    phone = email.trim()
    email = ""
    sanitization.swappedEmailToPhone = true
  }

  sanitization.passwordChanged = password !== passwordRaw
  sanitization.identifierChanged =
    sanitization.emailTrimmed ||
    sanitization.phoneTrimmed ||
    sanitization.emailHadInvisibleChars ||
    sanitization.phoneHadInvisibleChars ||
    sanitization.swappedPhoneToEmail ||
    sanitization.swappedEmailToPhone

  return {
    email: email || undefined,
    phone: phone || undefined,
    password,
    passwordRaw,
    passwordRawLength: passwordRaw.length,
    sanitization,
  }
}
