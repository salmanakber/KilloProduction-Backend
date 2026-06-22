import { type NextRequest, NextResponse } from "next/server"
import { getGoogleMapsRuntimeConfig } from "@/lib/google-maps"
import { cleanFormattedAddress } from "@/lib/format-google-address"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const place_id = searchParams.get("place_id") || ""
  const sessiontoken = searchParams.get("sessiontoken") || undefined

  if (!place_id) {
    return NextResponse.json({ result: null })
  }

  const mapsConfig = await getGoogleMapsRuntimeConfig()
  if (!mapsConfig.apiKey) {
    return NextResponse.json({ result: null })
  }

  const params = new URLSearchParams({
    place_id,
    key: mapsConfig.apiKey,
    fields: "place_id,formatted_address,geometry,address_components,name",
  })
  if (sessiontoken) params.set("sessiontoken", sessiontoken)

  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) return NextResponse.json({ result: null })
  const data = await res.json()

  const result = data?.result || null
  if (result) {
    if (result.formatted_address) {
      result.formatted_address = cleanFormattedAddress(result.formatted_address)
    }
    if (result.name) {
      result.name = cleanFormattedAddress(result.name)
    }
  }
  if (result?.address_components) {
    const components: Record<string, string> = {}
    result.address_components.forEach((comp: { types: string[]; long_name: string }) => {
      if (comp.types.includes("street_number")) components.streetNumber = comp.long_name
      else if (comp.types.includes("route")) components.streetName = comp.long_name
      else if (comp.types.includes("locality")) components.city = comp.long_name
      else if (comp.types.includes("administrative_area_level_1")) components.state = comp.long_name
      else if (comp.types.includes("country")) components.country = comp.long_name
      else if (comp.types.includes("postal_code")) components.postalCode = comp.long_name
    })
    result.addressComponents = components
  }

  return NextResponse.json({ result })
}
