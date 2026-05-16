import { type NextRequest, NextResponse } from "next/server"
import { geocodeAddress, getGoogleMapsRuntimeConfig } from "@/lib/google-maps"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get("address") || ""
  const sessiontoken = searchParams.get("sessiontoken") || undefined
  const countryOverride = searchParams.get("country") || undefined

  if (!address) {
    return NextResponse.json({ results: [] })
  }

  const mapsConfig = await getGoogleMapsRuntimeConfig()
  if (!mapsConfig.apiKey) {
    return NextResponse.json({ results: [] })
  }

  if (countryOverride) {
    mapsConfig.componentsParam = `country:${countryOverride.toLowerCase().slice(0, 2)}`
    mapsConfig.countryCode = countryOverride.toLowerCase().slice(0, 2)
  }

  const coords = await geocodeAddress(address, { sessiontoken })
  if (!coords) {
    return NextResponse.json({ results: [] })
  }

  return NextResponse.json({
    results: [
      {
        formatted_address: coords.formattedAddress,
        place_id: coords.placeId,
        geometry: { location: { lat: coords.lat, lng: coords.lng } },
      },
    ],
  })
}
