import { type NextRequest, NextResponse } from "next/server"
import {
  getCityCenter,
  getPopularPlacesForCity,
  resolveCityFromGeocode,
} from "@/lib/property-places-data"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const city = searchParams.get("city") || "Karachi"
    const limit = Math.min(Number.parseInt(searchParams.get("limit") || "12", 10), 20)

    const center = getCityCenter(city)
    const places = getPopularPlacesForCity(city, limit)

    return NextResponse.json({
      success: true,
      city: resolveCityFromGeocode(city),
      center,
      places,
    })
  } catch (error) {
    console.error("Property places GET error:", error)
    return NextResponse.json({ error: "Failed to load places" }, { status: 500 })
  }
}
