import { Module, CommissionType } from "@prisma/client"
import { checkoutPlatformFeeAmount } from "@/lib/commission-service"
import { tryCalculateCommissionAmount } from "@/lib/commission-service"
import { roundMoney2 } from "@/lib/money-round"

export interface PropertyQuoteInput {
  nightlyRate: number
  discountPercent?: number
  cleaningFee?: number
  securityDeposit?: number
  nights: number
}

export interface PropertyQuoteResult {
  nights: number
  nightlyRate: number
  effectiveNightlyRate: number
  discountedNights: number
  subtotal: number
  cleaningFee: number
  securityDeposit: number
  platformFee: number
  vendorCommissionEstimate: number
  totalAmount: number
}

export async function calculatePropertyQuote(
  input: PropertyQuoteInput
): Promise<PropertyQuoteResult> {
  const nights = Math.max(1, Math.floor(input.nights))
  const discount = Math.min(100, Math.max(0, Number(input.discountPercent || 0)))
  const nightlyRate = Number(input.nightlyRate) || 0
  const discountedNights = discount > 0 ? Math.min(7, nights) : 0
  const regularNights = nights - discountedNights
  const effectiveNightlyRate = roundMoney2(nightlyRate * (1 - discount / 100))
  const subtotal = roundMoney2(
    effectiveNightlyRate * discountedNights + nightlyRate * regularNights
  )
  const cleaningFee = roundMoney2(Number(input.cleaningFee || 0))
  const securityDeposit = roundMoney2(Number(input.securityDeposit || 0))

  const platformFee = await checkoutPlatformFeeAmount(Module.PROPERTY, subtotal + cleaningFee)
  const vendorCommissionEstimate = await tryCalculateCommissionAmount(
    Module.PROPERTY,
    subtotal + cleaningFee,
    CommissionType.VENDOR_COMMISSION
  )

  const totalAmount = roundMoney2(subtotal + cleaningFee + securityDeposit + platformFee)

  const blendedEffective =
    nights > 0 ? roundMoney2(subtotal / nights) : effectiveNightlyRate

  return {
    nights,
    nightlyRate,
    effectiveNightlyRate: blendedEffective,
    discountedNights,
    subtotal,
    cleaningFee,
    securityDeposit,
    platformFee,
    vendorCommissionEstimate,
    totalAmount,
  }
}

export function computeVendorEscrowPayout(
  subtotal: number,
  cleaningFee: number,
  vendorCommissionAmount: number
): number {
  const base = roundMoney2(subtotal + cleaningFee)
  return roundMoney2(Math.max(0, base - vendorCommissionAmount))
}
