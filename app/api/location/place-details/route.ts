import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const place_id = searchParams.get('place_id') || ''
  const sessiontoken = searchParams.get('sessiontoken') || undefined

  if (!place_id) {
    return NextResponse.json({ result: null })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ result: null })
  }

  const params = new URLSearchParams({ 
    place_id, 
    key: apiKey, 
    fields: 'formatted_address,geometry,address_components,name' 
  })
  if (sessiontoken) params.set('sessiontoken', sessiontoken)

  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) return NextResponse.json({ result: null })
  const data = await res.json()
  
  // Parse address components
  const result = data?.result || null
  if (result && result.address_components) {
    const components: any = {}
    result.address_components.forEach((comp: any) => {
      if (comp.types.includes('street_number')) {
        components.streetNumber = comp.long_name
      } else if (comp.types.includes('route')) {
        components.streetName = comp.long_name
      } else if (comp.types.includes('locality')) {
        components.city = comp.long_name
      } else if (comp.types.includes('administrative_area_level_1')) {
        components.state = comp.long_name
      } else if (comp.types.includes('country')) {
        components.country = comp.long_name
      } else if (comp.types.includes('postal_code')) {
        components.postalCode = comp.long_name
      }
    })
    result.addressComponents = components
  }
  
  return NextResponse.json({ result })
}


