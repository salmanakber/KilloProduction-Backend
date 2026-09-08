/**
 * Safe login-attempt diagnostics for audit logs.
 * NEVER store plaintext passwords.
 */
export function passwordAttemptMeta(password: unknown) {
  const raw = typeof password === "string" ? password : ""
  const trimmed = raw.trim()
  return {
    passwordLength: raw.length,
    passwordTrimmedLength: trimmed.length,
    passwordEmpty: trimmed.length === 0,
    hasLeadingOrTrailingWhitespace: raw.length > 0 && raw !== trimmed,
    hasInternalWhitespace: /\s/.test(trimmed),
    hasNonBreakingSpace: /\u00A0/.test(raw),
    hasZeroWidthChars: /[\u200B-\u200D\uFEFF]/.test(raw),
    hasUppercase: /[A-Z]/.test(raw),
    hasLowercase: /[a-z]/.test(raw),
    hasDigit: /\d/.test(raw),
    hasSpecialChar: /[^A-Za-z0-9\s]/.test(raw),
  }
}

export function loginRequestMeta(request: Request, body: {
  email?: unknown
  phone?: unknown
  password?: unknown
}) {
  const emailRaw = typeof body.email === "string" ? body.email : ""
  const phoneRaw = typeof body.phone === "string" ? body.phone : ""
  const email = emailRaw.trim()
  const phone = phoneRaw.trim()

  return {
    via: email ? "EMAIL" : phone ? "PHONE" : "UNKNOWN",
    emailEntered: email || null,
    phoneEntered: phone || null,
    emailHadWhitespace: emailRaw.length > 0 && emailRaw !== emailRaw.trim(),
    phoneHadWhitespace: phoneRaw.length > 0 && phoneRaw !== phoneRaw.trim(),
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null,
    userAgent: request.headers.get("user-agent") || null,
    ...passwordAttemptMeta(body.password),
  }
}

/** Actor for audits when no authenticated user exists (e.g. wrong email). */
export async function resolveLoginAuditActorId(
  prisma: { user: { findFirst: Function } },
  userId?: string | null,
): Promise<string | null> {
  if (userId) return userId
  const system = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  })
  return system?.id ?? null
}
