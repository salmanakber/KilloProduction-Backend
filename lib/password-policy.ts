import type { SystemSettings } from "@prisma/client"

export type PasswordPolicyRules = {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSpecialChars: boolean
}

export function getPasswordPolicyFromSettings(row: SystemSettings | null): PasswordPolicyRules {
  return {
    minLength: row?.passwordMinLength ?? 8,
    requireUppercase: row?.passwordRequireUppercase ?? true,
    requireLowercase: row?.passwordRequireLowercase ?? true,
    requireNumbers: row?.passwordRequireNumbers ?? true,
    requireSpecialChars: row?.passwordRequireSpecialChars ?? true,
  }
}

export function validatePasswordAgainstPolicy(
  password: string,
  rules: PasswordPolicyRules
): { ok: true } | { ok: false; message: string } {
  if (!password || password.length < rules.minLength) {
    return { ok: false, message: `Password must be at least ${rules.minLength} characters` }
  }
  if (rules.requireUppercase && !/[A-Z]/.test(password)) {
    return { ok: false, message: "Password must include an uppercase letter" }
  }
  if (rules.requireLowercase && !/[a-z]/.test(password)) {
    return { ok: false, message: "Password must include a lowercase letter" }
  }
  if (rules.requireNumbers && !/[0-9]/.test(password)) {
    return { ok: false, message: "Password must include a number" }
  }
  if (rules.requireSpecialChars && !/[^A-Za-z0-9]/.test(password)) {
    return { ok: false, message: "Password must include a special character" }
  }
  return { ok: true }
}
