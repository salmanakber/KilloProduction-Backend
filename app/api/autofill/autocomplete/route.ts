import { type NextRequest, NextResponse } from "next/server"
import {
  applyGoogleMapsCountryParams,
  getGoogleMapsRuntimeConfig,
} from "@/lib/google-maps"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const input = searchParams.get("input") || ""
    const sessiontoken = searchParams.get("sessiontoken") || undefined
    const types = searchParams.get("types") || "geocode"
    const location = searchParams.get("location") || undefined
    const radius = searchParams.get("radius") || undefined

    if (!input || input.length < 3) {
      return NextResponse.json({ predictions: [] })
    }

    const mapsConfig = await getGoogleMapsRuntimeConfig()
    if (!mapsConfig.apiKey) {
      return NextResponse.json(
        { error: "Google Maps API key not configured" },
        { status: 500 }
      )
    }

    const params = new URLSearchParams({
      input,
      key: mapsConfig.apiKey,
      types,
    })
    applyGoogleMapsCountryParams(params, mapsConfig)
    if (location) params.set("location", location)
    if (radius) params.set("radius", radius)
    if (sessiontoken) params.set("sessiontoken", sessiontoken)

    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`
    const res = await fetch(url)
    if (!res.ok) {
      return NextResponse.json(
        { error: "Autocomplete service unavailable" },
        { status: 503 }
      )
    }

    const data = await res.json()

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.error("Autocomplete API error:", data.status, data.error_message)
      return NextResponse.json({ predictions: [] })
    }

    const predictions = (data.predictions || []).map((pred: Record<string, unknown>) => ({
      description: pred.description,
      place_id: pred.place_id,
      structured_formatting: pred.structured_formatting,
      terms: pred.terms,
    }))

    return NextResponse.json({ predictions })
  } catch (error) {
    console.error("Autocomplete error:", error)
    return NextResponse.json(
      { error: "Failed to fetch autocomplete suggestions" },
      { status: 500 }
    )
  }
}
