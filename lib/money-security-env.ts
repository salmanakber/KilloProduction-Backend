/**
 * MONEY_TRANSFER_SECURITY_ENV=development | production (default: production)
 *
 * In development: skip developer-mode, simulator, VPN, and IP-country risk signals
 * so local testing is not blocked. Send/withdraw still enforce step-up when configured.
 */
export function isMoneySecurityDevelopment(): boolean {
const v = (process.env.MONEY_TRANSFER_SECURITY_ENV || "production").trim().toLowerCase()
  return v === "development" || v === "dev"
}

export function isMoneySecurityProduction(): boolean {
  return !isMoneySecurityDevelopment()
}
