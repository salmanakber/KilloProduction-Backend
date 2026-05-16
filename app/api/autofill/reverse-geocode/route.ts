import { type NextRequest, NextResponse } from "next/server"
import {
  applyGoogleMapsCountryParams,
  getGoogleMapsRuntimeConfig,
} from "@/lib/google-maps"

export async function POST(request: NextRequest) {
  try {
    const { latitude, longitude } = await request.json()

    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { error: "Latitude and longitude are required" },
        { status: 400 }
      )
    }

    const mapsConfig = await getGoogleMapsRuntimeConfig()
    if (!mapsConfig.apiKey) {
      return NextResponse.json(
        { error: "Google Maps API key not configured" },
        { status: 500 }
      )
    }

    const params = new URLSearchParams({
      latlng: `${latitude},${longitude}`,
      key: mapsConfig.apiKey,
    })
    applyGoogleMapsCountryParams(params, mapsConfig)

    const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
    const res = await fetch(url)
    if (!res.ok) {
      return NextResponse.json(
        { error: "Reverse geocoding service unavailable" },
        { status: 503 }
      )
    }

    const data = await res.json()

    if (data.status !== "OK" || !data.results?.length) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 })
    }

    const topResult = data.results[0]
    const components = topResult.address_components || []

    let city = ""
    let state = ""
    let country = ""
    let postalCode = ""
    let streetNumber = ""
    let route = ""

    for (const comp of components) {
      const types: string[] = comp.types || []
      if (types.includes("street_number")) streetNumber = comp.long_name
      if (types.includes("route")) route = comp.long_name
      if (types.includes("locality")) city = comp.long_name
      if (types.includes("administrative_area_level_1")) state = comp.long_name
      if (types.includes("country")) country = comp.long_name
      if (types.includes("postal_code")) postalCode = comp.long_name
    }

    const addressLine = [streetNumber, route].filter(Boolean).join(" ").trim()
    const formattedAddress = topResult.formatted_address

    return NextResponse.json({
      formattedAddress,
      addressLine: addressLine || formattedAddress,
      city,
      state,
      country,
      postalCode,
      latitude,
      longitude,
    })
  } catch (error) {
    console.error("Reverse geocoding error:", error)
    return NextResponse.json({ error: "Failed to reverse geocode location" }, { status: 500 })
  }
}
