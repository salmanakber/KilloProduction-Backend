import { type NextRequest, NextResponse } from "next/server"

// Helper function to resolve coordinates from address
async function resolveCoordinates(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.warn("Google Maps API key not found")
    return null
  }

  try {
    const encodedAddress = encodeURIComponent(address)
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    )
    
    if (!response.ok) {
      console.error("Geocoding API error:", response.status)
      return null
    }

    const data = await response.json()
    console.log("Google Maps API Response:", data)
    
    if (data.status === "OK" && data.results.length > 0) {
      const location = data.results[0].geometry.location
      return {
        lat: location.lat,
        lng: location.lng
      }
    }
    
    return null
  } catch (error) {
    console.error("Error resolving coordinates:", error)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')
    
    if (!address) {
      return NextResponse.json({
        success: false,
        error: "Address parameter is required"
      })
    }

    console.log(`Testing geocoding for address: ${address}`)
    console.log(`Google Maps API Key: ${process.env.GOOGLE_MAPS_API_KEY ? 'Present' : 'Missing'}`)

    const coordinates = await resolveCoordinates(address)
    
    if (coordinates) {
      return NextResponse.json({
        success: true,
        address,
        coordinates,
        message: "Geocoding successful"
      })
    } else {
      return NextResponse.json({
        success: false,
        address,
        error: "Failed to geocode address"
      })
    }

  } catch (error) {
    console.error("Error in geocoding test:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}
