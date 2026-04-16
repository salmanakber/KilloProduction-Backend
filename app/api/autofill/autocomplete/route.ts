import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const input = searchParams.get('input') || ''
    const sessiontoken = searchParams.get('sessiontoken') || undefined
    /** e.g. `geocode` (default) or `(cities)` for city/locality results */
    const types = searchParams.get('types') || 'geocode'
    /** `lat,lng` — when set with `radius`, biases results toward the user */
    const location = searchParams.get('location') || undefined
    /** meters — Google requires this when `location` is set for autocomplete bias */
    const radius = searchParams.get('radius') || undefined

    if (!input || input.length < 3) {
      return NextResponse.json({ predictions: [] })
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Google Maps API key not configured' },
        { status: 500 }
      )
    }

    const params = new URLSearchParams({
      input,
      key: apiKey,
      types,
    })
    if (location) params.set('location', location)
    if (radius) params.set('radius', radius)
    console.log("params", params)
    
    if (sessiontoken) {
      params.set('sessiontoken', sessiontoken)
    }

    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`
    console.log('🔍 Autocomplete request:', input)
    
    const res = await fetch(url)
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Autocomplete service unavailable' },
        { status: 503 }
      )
    }

    const data = await res.json()

    console.log("data", data) 
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Autocomplete API error:', data.status)
      return NextResponse.json({ predictions: [] })
    }

    const predictions = (data.predictions || []).map((pred: any) => ({
      description: pred.description,
      place_id: pred.place_id,
      structured_formatting: pred.structured_formatting,
      terms: pred.terms,
    }))

    console.log(`✅ Found ${predictions.length} suggestions`)
    return NextResponse.json({ predictions })
  } catch (error) {
    console.error('Autocomplete error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch autocomplete suggestions' },
      { status: 500 }
    )
  }
}
