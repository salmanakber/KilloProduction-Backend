import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/** Mobile allowlist metadata — flags must match `mobile/app/src/utils/currencies.ts`. */
const CURRENCY_META: Record<
  string,
  { code: string; name: string; symbol: string; flag: string }
> = {
  USD: { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸" },
  NGN: { code: "NGN", name: "Nigerian Naira", symbol: "₦", flag: "🇳🇬" },
  GBP: { code: "GBP", name: "British Pound", symbol: "£", flag: "🇬🇧" },
  EUR: { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺" },
  CAD: { code: "CAD", name: "Canadian Dollar", symbol: "C$", flag: "🇨🇦" },
  AUD: { code: "AUD", name: "Australian Dollar", symbol: "A$", flag: "🇦🇺" },
  JPY: { code: "JPY", name: "Japanese Yen", symbol: "¥", flag: "🇯🇵" },
  CNY: { code: "CNY", name: "Chinese Yuan", symbol: "¥", flag: "🇨🇳" },
  INR: { code: "INR", name: "Indian Rupee", symbol: "₹", flag: "🇮🇳" },
  PKR: { code: "PKR", name: "Pakistani Rupee", symbol: "₨", flag: "🇵🇰" },
  AED: { code: "AED", name: "UAE Dirham", symbol: "د.إ", flag: "🇦🇪" },
  SAR: { code: "SAR", name: "Saudi Riyal", symbol: "﷼", flag: "🇸🇦" },
  ZAR: { code: "ZAR", name: "South African Rand", symbol: "R", flag: "🇿🇦" },
  KES: { code: "KES", name: "Kenyan Shilling", symbol: "KSh", flag: "🇰🇪" },
  GHS: { code: "GHS", name: "Ghanaian Cedi", symbol: "₵", flag: "🇬🇭" },
  EGP: { code: "EGP", name: "Egyptian Pound", symbol: "E£", flag: "🇪🇬" },
  BRL: { code: "BRL", name: "Brazilian Real", symbol: "R$", flag: "🇧🇷" },
  MXN: { code: "MXN", name: "Mexican Peso", symbol: "$", flag: "🇲🇽" },
  SGD: { code: "SGD", name: "Singapore Dollar", symbol: "S$", flag: "🇸🇬" },
  MYR: { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", flag: "🇲🇾" },
  THB: { code: "THB", name: "Thai Baht", symbol: "฿", flag: "🇹🇭" },
  IDR: { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", flag: "🇮🇩" },
  PHP: { code: "PHP", name: "Philippine Peso", symbol: "₱", flag: "🇵🇭" },
  KRW: { code: "KRW", name: "South Korean Won", symbol: "₩", flag: "🇰🇷" },
  CHF: { code: "CHF", name: "Swiss Franc", symbol: "CHF", flag: "🇨🇭" },
  SEK: { code: "SEK", name: "Swedish Krona", symbol: "kr", flag: "🇸🇪" },
  NOK: { code: "NOK", name: "Norwegian Krone", symbol: "kr", flag: "🇳🇴" },
  DKK: { code: "DKK", name: "Danish Krone", symbol: "kr", flag: "🇩🇰" },
  PLN: { code: "PLN", name: "Polish Zloty", symbol: "zł", flag: "🇵🇱" },
  TRY: { code: "TRY", name: "Turkish Lira", symbol: "₺", flag: "🇹🇷" },
  RUB: { code: "RUB", name: "Russian Ruble", symbol: "₽", flag: "🇷🇺" },
  ILS: { code: "ILS", name: "Israeli Shekel", symbol: "₪", flag: "🇮🇱" },
  NZD: { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", flag: "🇳🇿" },
}

export async function GET(_request: NextRequest) {
  try {
    const [config, settings] = await Promise.all([
      prisma.moneyTransferConfig.findFirst({
        select: { supportedCurrencies: true, isEnabled: true },
      }),
      prisma.systemSettings.findUnique({
        where: { id: 1 },
        select: { currency: true },
      }),
    ])

    const supportedCodes = (config?.supportedCurrencies?.length
      ? config.supportedCurrencies
      : ["USD", "NGN"]
    ).map((c) => String(c).trim().toUpperCase().slice(0, 3))

    const currencies = supportedCodes
      .map((code) => CURRENCY_META[code] ?? { code, name: code, symbol: code, flag: "💱" })
      .filter((c) => c.code)

    return NextResponse.json({
      success: true,
      isEnabled: config?.isEnabled ?? true,
      defaultCurrency: String(settings?.currency || "NGN")
        .trim()
        .toUpperCase()
        .slice(0, 3),
      supportedCurrencies: supportedCodes,
      currencies,
      transferFeePercentage: config?.transferFeePercentage ?? 0,
      transferFeeFixed: config?.transferFeeFixed ?? 0,
      exchangeRateMargin: config?.exchangeRateMargin ?? 0.02,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load config"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
