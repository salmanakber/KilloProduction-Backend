import {
  HAVERSINE_ONLY_MAX_KM,
  estimatedMinutesFromDistanceKm,
  haversineKm,
} from "@/lib/delivery-distance-policy"

/**
 * Single origin→destination leg: use Haversine only when straight-line distance ≤ {@link HAVERSINE_ONLY_MAX_KM};
 * otherwise Google Distance Matrix (driving), with Haversine fallback if the API fails.
 */
export async function getDrivingDistanceKmSmart(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string
): Promise<{ distance: number; durationMinutes: number }> {
  const straightKm = haversineKm(originLat, originLng, destLat, destLng)
  if (straightKm <= HAVERSINE_ONLY_MAX_KM) {
    return {
      distance: straightKm,
      durationMinutes: estimatedMinutesFromDistanceKm(straightKm),
    }
  }

  try {
    const params = new URLSearchParams({
      origins: `${originLat},${originLng}`,
      destinations: `${destLat},${destLng}`,
      key: apiKey,
      mode: "driving",
      units: "metric",
    })
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`
    const res = await fetch(url)
    if (!res.ok) {
      return {
        distance: straightKm,
        durationMinutes: estimatedMinutesFromDistanceKm(straightKm),
      }
    }
    const data = await res.json()
    if (data.status === "OK" && data.rows?.[0]?.elements?.[0]?.status === "OK") {
      const element = data.rows[0].elements[0]
      return {
        distance: element.distance.value / 1000,
        durationMinutes: element.duration.value / 60,
      }
    }
  } catch (e) {
    console.warn("Distance Matrix error, using Haversine:", e)
  }

  return {
    distance: straightKm,
    durationMinutes: estimatedMinutesFromDistanceKm(straightKm),
  }
}
