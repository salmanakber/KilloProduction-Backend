/** Google Open Location Code prefix, e.g. R6Q4+GRQ */
const PLUS_CODE_PREFIX_RE = /^[A-Z0-9]{4,8}\+[A-Z0-9]{2,3}(?:\s*,?\s*)/i

export function stripPlusCodeFromAddress(address: string): string {
  if (!address) return address
  let cleaned = String(address).trim()
  let prev = ''
  while (cleaned !== prev) {
    prev = cleaned
    cleaned = cleaned.replace(PLUS_CODE_PREFIX_RE, '').trim()
    cleaned = cleaned.replace(/^,\s*/, '')
  }
  return cleaned || address
}

type GeocodeResult = {
  formatted_address?: string
  types?: string[]
  address_components?: { types?: string[] }[]
}

/** Prefer a street-level geocode result over a plus-code-only label. */
export function pickBestGeocodeResult(results: GeocodeResult[]): GeocodeResult | null {
  if (!results?.length) return null
  const preferred = results.find(
    (r) =>
      r.types?.includes('street_address') ||
      r.types?.includes('premise') ||
      r.types?.includes('route') ||
      r.address_components?.some((c) => c.types?.includes('route')),
  )
  return preferred || results[0]
}

export function cleanFormattedAddress(address?: string | null): string {
  return stripPlusCodeFromAddress(address || '')
}
