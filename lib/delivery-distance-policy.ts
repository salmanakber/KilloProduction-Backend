/**
 * Single policy for courier/delivery distance: straight-line (Haversine) chain length
 * at or below this threshold skips Google Directions / Distance Matrix.
 */
export const HAVERSINE_ONLY_MAX_KM = 5

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** City-ish average speed for ETA from straight-line km when not using Google. */
export function estimatedMinutesFromDistanceKm(distanceKm: number, avgSpeedKmh = 30): number {
  return Math.max(1, Math.ceil((distanceKm / avgSpeedKmh) * 60))
}

/** Sum of Haversine legs following pickup order, then last pickup → dropoff. */
export function haversineChainInputOrderKm(
  pickups: { latitude: number; longitude: number }[],
  drop: { latitude: number; longitude: number }
): number {
  if (pickups.length === 0) return 0
  let t = 0
  for (let i = 0; i < pickups.length - 1; i++) {
    t += haversineKm(
      pickups[i].latitude,
      pickups[i].longitude,
      pickups[i + 1].latitude,
      pickups[i + 1].longitude
    )
  }
  const last = pickups[pickups.length - 1]
  t += haversineKm(last.latitude, last.longitude, drop.latitude, drop.longitude)
  return t
}
