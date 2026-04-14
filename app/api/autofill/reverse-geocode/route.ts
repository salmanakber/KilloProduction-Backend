import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { latitude, longitude } = await request.json()

    if (!latitude || !longitude) {
      return NextResponse.json(
        { error: 'Latitude and longitude are required' },
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

    // Use Google Reverse Geocoding API to convert coordinates to address
    const params = new URLSearchParams({
      latlng: `${latitude},${longitude}`,
      key: apiKey,
      result_type: 'locality|administrative_area_level_1|country' // Get city, state, country
    })

    const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
    console.log('🗺️ Reverse geocoding coordinates:', { latitude, longitude })
    
    const res = await fetch(url)
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Reverse geocoding service unavailable' },
        { status: 503 }
      )
    }

    const data = await res.json()
    
    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      return NextResponse.json(
        { error: 'Location not found' },
        { status: 404 }
      )
    }

    // Extract city, state, and country from results
    let city = ''
    let state = ''
    let country = ''
    let formattedAddress = data.results[0].formatted_address

    for (const component of data.results[0].address_components) {
      if (component.types.includes('locality')) {
        city = component.long_name
      } else if (component.types.includes('administrative_area_level_1')) {
        state = component.long_name
      } else if (component.types.includes('country')) {
        country = component.long_name
      }
    }

    // Fallback: if no city found, try to get from formatted address
    if (!city && formattedAddress) {
      const parts = formattedAddress.split(',')
      if (parts.length > 0) {
        city = parts[0].trim()
      }
    }

    console.log('✅ Reverse geocoded successfully:', { city, state, country, formattedAddress })

    return NextResponse.json({
      city,
      state,
      country,
      formattedAddress,
      placeId: data.results[0].place_id
    })

  } catch (error) {
    console.error('Reverse geocoding error:', error)
    return NextResponse.json(
      { error: 'Failed to reverse geocode location' },
      { status: 500 }
    )
  }
}

