import { type NextRequest, NextResponse } from "next/server"

// Returns a best-effort list of sublocalities/neighborhoods for a given geofence.
// NOTE: Google does not provide a perfect "list all areas in a city" API; this uses Places Text Search heuristics.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const lat = searchParams.get("lat") ? Number(searchParams.get("lat")) : null
    const lon = searchParams.get("lon") ? Number(searchParams.get("lon")) : null
    const radiusKm = searchParams.get("radiusKm") ? Number(searchParams.get("radiusKm")) : 30
    const city = (searchParams.get("city") || "").trim()

    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ sublocalities: [] }, { status: 200 })
    }

    const hasCoords = lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon)
    if (!hasCoords && !city) {
      return NextResponse.json({ sublocalities: [] }, { status: 200 })
    }

    const radius = Math.max(1000, Math.min(50000, Math.round((Number.isFinite(radiusKm) ? radiusKm : 30) * 1000)))

    const textSearch = async (query: string) => {
      const params = new URLSearchParams({ query, key: apiKey })
      if (hasCoords) {
        params.set("location", `${lat},${lon}`)
        params.set("radius", String(radius))
      }
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`
      const res = await fetch(url)
      if (!res.ok) return []
      const data = await res.json().catch(() => ({} as any))
      const status = data?.status
      if (status !== "OK" && status !== "ZERO_RESULTS") return []
      return Array.isArray(data?.results) ? data.results : []
    }

    const baseCity = city || (hasCoords ? "" : "")
    const queries = baseCity
      ? [`neighborhood in ${baseCity}`, `sublocality in ${baseCity}`]
      : ["neighborhood", "sublocality"]

    const results = (await Promise.all(queries.map((q) => textSearch(q)))).flat()

    const allowTypes = new Set([
      "sublocality",
      "sublocality_level_1",
      "sublocality_level_2",
      "neighborhood",
      "political",
    ])

    const names = new Set<string>()
    for (const r of results as any[]) {
      const n = String(r?.name || "").trim()
      const types = Array.isArray(r?.types) ? r.types : []
      if (!n) continue
      // Keep only place types that look like areas (best-effort).
      if (types.length > 0 && !types.some((t: string) => allowTypes.has(t))) continue
      names.add(n)
    }

    const sublocalities = Array.from(names).sort((a, b) => a.localeCompare(b))
    return NextResponse.json({ sublocalities })
  } catch (error) {
    console.error("Sublocalities fetch error:", error)
    return NextResponse.json({ sublocalities: [] }, { status: 200 })
  }
}

