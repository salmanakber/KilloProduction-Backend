/** Popular areas and city centers for property destination search */

export type PopularPlace = {
  id: string
  label: string
  area: string
  city: string
  state?: string
  country: string
  latitude: number
  longitude: number
}

export type CityCenter = {
  city: string
  country: string
  latitude: number
  longitude: number
  flag: string
}

const KARACHI_PLACES: PopularPlace[] = [
  { id: "khi-clifton", label: "Clifton", area: "Clifton", city: "Karachi", state: "Sindh", country: "Pakistan", latitude: 24.8138, longitude: 67.0299 },
  { id: "khi-dha5", label: "DHA Phase 5", area: "DHA Phase 5", city: "Karachi", state: "Sindh", country: "Pakistan", latitude: 24.7924, longitude: 67.0562 },
  { id: "khi-dha6", label: "DHA Phase 6", area: "DHA Phase 6", city: "Karachi", state: "Sindh", country: "Pakistan", latitude: 24.7782, longitude: 67.0751 },
  { id: "khi-seaview", label: "Sea View", area: "Sea View", city: "Karachi", state: "Sindh", country: "Pakistan", latitude: 24.7881, longitude: 67.0382 },
  { id: "khi-bahria", label: "Bahria Town Karachi", area: "Bahria Town", city: "Karachi", state: "Sindh", country: "Pakistan", latitude: 25.0122, longitude: 67.3126 },
  { id: "khi-pechs", label: "PECHS", area: "PECHS", city: "Karachi", state: "Sindh", country: "Pakistan", latitude: 24.8671, longitude: 67.0742 },
  { id: "khi-gulshan", label: "Gulshan-e-Iqbal", area: "Gulshan-e-Iqbal", city: "Karachi", state: "Sindh", country: "Pakistan", latitude: 24.9142, longitude: 67.0822 },
  { id: "khi-saddar", label: "Saddar", area: "Saddar", city: "Karachi", state: "Sindh", country: "Pakistan", latitude: 24.8546, longitude: 67.0203 },
  { id: "khi-nazimabad", label: "Nazimabad", area: "Nazimabad", city: "Karachi", state: "Sindh", country: "Pakistan", latitude: 24.9153, longitude: 67.0292 },
  { id: "khi-fb", label: "Federal B Area", area: "Federal B Area", city: "Karachi", state: "Sindh", country: "Pakistan", latitude: 24.9265, longitude: 67.0695 },
  { id: "khi-sharae", label: "Shahrah-e-Faisal", area: "Shahrah-e-Faisal", city: "Karachi", state: "Sindh", country: "Pakistan", latitude: 24.8661, longitude: 67.1301 },
  { id: "khi-korangi", label: "Korangi", area: "Korangi", city: "Karachi", state: "Sindh", country: "Pakistan", latitude: 24.8181, longitude: 67.1261 },
]

const CITY_CENTERS: CityCenter[] = [
  { city: "Karachi", country: "Pakistan", latitude: 24.8607, longitude: 67.0011, flag: "🇵🇰" },
  { city: "Lahore", country: "Pakistan", latitude: 31.5204, longitude: 74.3587, flag: "🇵🇰" },
  { city: "Islamabad", country: "Pakistan", latitude: 33.6844, longitude: 73.0479, flag: "🇵🇰" },
  { city: "Dubai", country: "UAE", latitude: 25.2048, longitude: 55.2708, flag: "🇦🇪" },
]

const PLACES_BY_CITY: Record<string, PopularPlace[]> = {
  karachi: KARACHI_PLACES,
}

export function normalizeCityKey(city: string): string {
  return city.split(",")[0].trim().toLowerCase()
}

export function getCityCenter(city: string): CityCenter | null {
  const key = normalizeCityKey(city)
  return CITY_CENTERS.find((c) => normalizeCityKey(c.city) === key) || null
}

export function getPopularPlacesForCity(city: string, limit = 12): PopularPlace[] {
  const key = normalizeCityKey(city)
  const list = PLACES_BY_CITY[key] || []
  return list.slice(0, limit)
}

export function resolveCityFromGeocode(city?: string, country?: string): string {
  if (city?.trim()) return city.split(",")[0].trim()
  if (country?.toLowerCase().includes("pakistan")) return "Karachi"
  return city || "Karachi"
}

export function defaultCityForCountry(country?: string): CityCenter {
  if (country?.toLowerCase().includes("pakistan")) {
    return CITY_CENTERS.find((c) => c.city === "Karachi")!
  }
  return CITY_CENTERS[0]
}
