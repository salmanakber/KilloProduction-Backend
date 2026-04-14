import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const input = searchParams.get('input') || ''
  const sessiontoken = searchParams.get('sessiontoken') || undefined

  if (!input) {
    return NextResponse.json({ predictions: [] })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ predictions: [] })
  }

  const params = new URLSearchParams({ input, key: apiKey, types: 'geocode' })
  if (sessiontoken) params.set('sessiontoken', sessiontoken)

  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`
  console.log('url', url)
  const res = await fetch(url)
  if (!res.ok) return NextResponse.json({ predictions: [] })
  const data = await res.json()
  return NextResponse.json({ predictions: data?.predictions || [] })
}


