import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json()
    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      )
    }

    
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Google Maps API key not configured' },
        { status: 500 }
      )
    }

    // Use Google Geocoding API to convert address to coordinates
    const params = new URLSearchParams({
      address,
      key: apiKey
    })

    const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
    console.log('🗺️ Geocoding address:', address)
    
    const res = await fetch(url)
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Geocoding service unavailable' },
        { status: 503 }
      )
    }

    const data = await res.json()
    
    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      return NextResponse.json(
        { error: 'Address not found' },
        { status: 404 }
      )
    }

    const location = data.results[0].geometry.location
    const formattedAddress = data.results[0].formatted_address
    return NextResponse.json({
      latitude: location.lat,
      longitude: location.lng,
      formattedAddress,
      placeId: data.results[0].place_id
    })

  } catch (error) {
    console.error('Geocoding error:', error)
    return NextResponse.json(
      { error: 'Failed to geocode address' },
      { status: 500 }
    )
  }
}

