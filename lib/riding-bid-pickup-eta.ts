import { estimatedMinutesFromDistanceKm, haversineKm } from "@/lib/delivery-distance-policy"
import { getDrivingDistanceKmSmart } from "@/lib/driving-distance-smart"

export function parseRiderCurrentLocation(raw: unknown): { lat: number; lng: number } | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const lat =
    typeof o.latitude === "number"
      ? o.latitude
      : typeof o.lat === "number"
        ? o.lat
        : null
  const lng =
    typeof o.longitude === "number"
      ? o.longitude
      : typeof o.lng === "number"
        ? o.lng
        : null
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

export async function computeRiderPickupEta(params: {
  riderLocation: unknown
  pickupLat: number
  pickupLng: number
  googleApiKey?: string | null
}): Promise<{ pickupEtaMinutes: number | null; pickupDistanceKm: number | null }> {
  const pickupLat = Number(params.pickupLat)
  const pickupLng = Number(params.pickupLng)
  if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
    return { pickupEtaMinutes: null, pickupDistanceKm: null }
  }

  const rider = parseRiderCurrentLocation(params.riderLocation)
  if (!rider) {
    return { pickupEtaMinutes: null, pickupDistanceKm: null }
  }

  const apiKey = params.googleApiKey || process.env.GOOGLE_MAPS_API_KEY || null
  if (!apiKey) {
    const km = haversineKm(rider.lat, rider.lng, pickupLat, pickupLng)
    return {
      pickupEtaMinutes: estimatedMinutesFromDistanceKm(km),
      pickupDistanceKm: Math.round(km * 100) / 100,
    }
  }

  const result = await getDrivingDistanceKmSmart(
    rider.lat,
    rider.lng,
    pickupLat,
    pickupLng,
    apiKey,
  )

  return {
    pickupEtaMinutes: Math.max(1, Math.round(result.durationMinutes)),
    pickupDistanceKm: Math.round(result.distance * 100) / 100,
  }
}
