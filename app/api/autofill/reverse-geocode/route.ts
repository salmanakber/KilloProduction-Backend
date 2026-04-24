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

    // Use Google Reverse Geocoding API to convert coordinates to detailed address
    const params = new URLSearchParams({
      latlng: `${latitude},${longitude}`,
      key: apiKey,
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

    // Prefer the most specific result for precise address details.
    const topResult = data.results[0]
    const components = topResult.address_components || []

    // Extract city, state, and country from results
    let city = ''
    let state = ''
    let country = ''
    let formattedAddress = topResult.formatted_address || ''
    let streetNumber = ''
    let route = ''
    let neighborhood = ''
    let premise = ''
    let subpremise = ''

    for (const component of components) {
      if (component.types.includes('street_number')) {
        streetNumber = component.long_name
      } else if (component.types.includes('route')) {
        route = component.long_name
      } else if (component.types.includes('premise')) {
        premise = component.long_name
      } else if (component.types.includes('subpremise')) {
        subpremise = component.long_name
      } else if (
        component.types.includes('sublocality') ||
        component.types.includes('sublocality_level_1') ||
        component.types.includes('neighborhood')
      ) {
        neighborhood = component.long_name
      }

      if (component.types.includes('locality')) {
        city = component.long_name
      } else if (component.types.includes('administrative_area_level_2') && !city) {
        city = component.long_name
      } else if (component.types.includes('administrative_area_level_1')) {
        state = component.long_name
      } else if (component.types.includes('country')) {
        country = component.long_name
      }
    }

    // Fallbacks for missing city
    if (!city && formattedAddress) {
      const parts = formattedAddress.split(',')
      if (parts.length > 0) {
        city = parts[1]?.trim() || parts[0].trim()
      }
    }

    const streetPart = [streetNumber, route].filter(Boolean).join(' ').trim()
    const blockOrBuilding = [premise, subpremise].filter(Boolean).join(' ').trim()
    const exactAddress = [blockOrBuilding, streetPart, neighborhood].filter(Boolean).join(', ')
    const addressLine = exactAddress || (formattedAddress.split(',')[0] || '').trim()

    console.log('✅ Reverse geocoded successfully:', { city, state, country, addressLine, formattedAddress })

    return NextResponse.json({
      city,
      state,
      country,
      addressLine,
      formattedAddress,
      placeId: topResult.place_id
    })

  } catch (error) {
    console.error('Reverse geocoding error:', error)
    return NextResponse.json(
      { error: 'Failed to reverse geocode location' },
      { status: 500 }
    )
  }
}

