import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address') || ''
  const sessiontoken = searchParams.get('sessiontoken') || undefined
  const country = searchParams.get('country') || undefined

  if (!address) {
    return NextResponse.json({ results: [] })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ results: [] })
  }

  const params = new URLSearchParams({
    address,
    key: apiKey,
  })
  // Optional restriction for better accuracy. If omitted, geocoding works globally.
  if (country) params.set("components", `country:${country}`)
  if (sessiontoken) params.set('sessiontoken', sessiontoken)

  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
  
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.error('Geocoding API error:', res.status)
      return NextResponse.json({ results: [] })
    }
    
    const data = await res.json()
    
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      return NextResponse.json({ results: data.results })
    } else {
      console.log('Geocoding API returned no results for address:', address)
      return NextResponse.json({ results: [] })
    }
  } catch (error) {
    console.error('Error calling Geocoding API:', error)
    return NextResponse.json({ results: [] })
  }
}
