import { type NextRequest, NextResponse } from "next/server"
import {
  applyGoogleMapsCountryParams,
  getGoogleMapsRuntimeConfig,
} from "@/lib/google-maps"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const input = searchParams.get("input") || ""
  const sessiontoken = searchParams.get("sessiontoken") || undefined

  if (!input) {
    return NextResponse.json({ predictions: [] })
  }

  const mapsConfig = await getGoogleMapsRuntimeConfig()
  if (!mapsConfig.apiKey) {
    return NextResponse.json({ predictions: [] })
  }

  const params = new URLSearchParams({
    input,
    key: mapsConfig.apiKey,
    types: "geocode",
  })
  applyGoogleMapsCountryParams(params, mapsConfig)
  if (sessiontoken) params.set("sessiontoken", sessiontoken)

  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) return NextResponse.json({ predictions: [] })
  const data = await res.json()
  return NextResponse.json({ predictions: data?.predictions || [] })
}
