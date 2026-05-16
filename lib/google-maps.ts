import { prisma } from "@/lib/prisma"

export type GoogleMapsRuntimeConfig = {
  apiKey: string
  apiKeySource: "database" | "env" | "none"
  /** ISO 3166-1 alpha-2, lowercase */
  countryCode: string
  restrictToCountry: boolean
  /** e.g. `country:ng` for Places autocomplete / geocode components */
  componentsParam?: string
}

const DEFAULT_COUNTRY =
  (process.env.LOCATION_COUNTRY_CODE || "ng").trim().toLowerCase().slice(0, 2) || "ng"

function readLocationFromCompnyinfo(compnyinfo: unknown): {
  countryCode?: string
  restrictAutocomplete?: boolean
  googleMapsApiKey?: string
} {
  if (!compnyinfo || typeof compnyinfo !== "object") return {}
  const location = (compnyinfo as Record<string, unknown>).location
  if (!location || typeof location !== "object") return {}
  const loc = location as Record<string, unknown>
  return {
    countryCode:
      typeof loc.countryCode === "string"
        ? loc.countryCode.trim().toLowerCase().slice(0, 2)
        : undefined,
    restrictAutocomplete:
      typeof loc.restrictAutocomplete === "boolean" ? loc.restrictAutocomplete : undefined,
    googleMapsApiKey:
      typeof loc.googleMapsApiKey === "string" ? loc.googleMapsApiKey.trim() : undefined,
  }
}

/**
 * Database setting first, then GOOGLE_MAPS_API_KEY env fallback.
 */
export function resolveGoogleMapsApiKey(storedInDb?: string | null): {
  apiKey: string
  source: GoogleMapsRuntimeConfig["apiKeySource"]
} {
  const fromDb = storedInDb?.trim()
  if (fromDb) {
    return { apiKey: fromDb, source: "database" }
  }
  const fromEnv = process.env.GOOGLE_MAPS_API_KEY?.trim()
  if (fromEnv) {
    return { apiKey: fromEnv, source: "env" }
  }
  return { apiKey: "", source: "none" }
}

/** Server-side Google Maps key + country restriction from SystemSettings + env fallback */
export async function getGoogleMapsRuntimeConfig(): Promise<GoogleMapsRuntimeConfig> {
  const row = await prisma.systemSettings.findUnique({ where: { id: 1 } })
  const fromDb = readLocationFromCompnyinfo(row?.compnyinfo)

  const { apiKey, source } = resolveGoogleMapsApiKey(fromDb.googleMapsApiKey)
  const countryCode = fromDb.countryCode || DEFAULT_COUNTRY
  const restrictToCountry = fromDb.restrictAutocomplete !== false

  return {
    apiKey,
    apiKeySource: source,
    countryCode,
    restrictToCountry,
    componentsParam:
      restrictToCountry && countryCode ? `country:${countryCode}` : undefined,
  }
}

export function applyGoogleMapsCountryParams(
  params: URLSearchParams,
  config: GoogleMapsRuntimeConfig
): void {
  if (config.componentsParam) {
    params.set("components", config.componentsParam)
  }
  if (config.countryCode) {
    params.set("region", config.countryCode)
  }
}

export async function geocodeAddress(
  address: string,
  options?: { sessiontoken?: string }
): Promise<{
  lat: number
  lng: number
  formattedAddress: string
  placeId?: string
} | null> {
  const config = await getGoogleMapsRuntimeConfig()
  if (!config.apiKey) return null

  const params = new URLSearchParams({ address, key: config.apiKey })
  applyGoogleMapsCountryParams(params, config)
  if (options?.sessiontoken) params.set("sessiontoken", options.sessiontoken)

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
  )
  if (!res.ok) return null

  const data = await res.json()
  if (data.status !== "OK" || !data.results?.length) return null

  const first = data.results[0]
  return {
    lat: first.geometry.location.lat,
    lng: first.geometry.location.lng,
    formattedAddress: first.formatted_address,
    placeId: first.place_id,
  }
}

/** Public location prefs for mobile (no API key). */
export async function getPublicLocationConfig() {
  const config = await getGoogleMapsRuntimeConfig()
  return {
    countryCode: config.countryCode,
    restrictAutocomplete: config.restrictToCountry,
    mapsConfigured: Boolean(config.apiKey),
    mapsApiKeySource: config.apiKeySource,
  }
}
