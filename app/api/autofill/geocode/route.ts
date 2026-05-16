import { type NextRequest, NextResponse } from "next/server"
import { geocodeAddress, getGoogleMapsRuntimeConfig } from "@/lib/google-maps"

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json()
    if (!address) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 })
    }

    const mapsConfig = await getGoogleMapsRuntimeConfig()
    if (!mapsConfig.apiKey) {
      return NextResponse.json(
        { error: "Google Maps API key not configured" },
        { status: 500 }
      )
    }

    const result = await geocodeAddress(String(address))
    if (!result) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 })
    }

    return NextResponse.json({
      latitude: result.lat,
      longitude: result.lng,
      formattedAddress: result.formattedAddress,
      placeId: result.placeId,
    })
  } catch (error) {
    console.error("Geocoding error:", error)
    return NextResponse.json({ error: "Failed to geocode address" }, { status: 500 })
  }
}
