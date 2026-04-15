import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { getDrivingDistanceKmSmart } from "@/lib/driving-distance-smart"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { 
      originLatitude, 
      originLongitude, 
      destinationLatitude, 
      destinationLongitude 
    } = body

    // Validate required coordinates
    if (
      typeof originLatitude !== 'number' || 
      typeof originLongitude !== 'number' ||
      typeof destinationLatitude !== 'number' || 
      typeof destinationLongitude !== 'number'
    ) {
      return NextResponse.json(
        { error: "Origin and destination coordinates (latitude, longitude) are required" },
        { status: 400 }
      )
    }

    // Validate coordinate ranges
    if (
      !isValidCoordinates(originLatitude, originLongitude) ||
      !isValidCoordinates(destinationLatitude, destinationLongitude)
    ) {
      return NextResponse.json(
        { error: "Invalid coordinate values provided" },
        { status: 400 }
      )
    }

    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!googleApiKey) {
      console.warn("Google Maps API key not found")
      return NextResponse.json(
        { error: "Distance calculation service unavailable" },
        { status: 503 }
      )
    }

    // Calculate distance using Google Distance Matrix API
    let distance = 0
    let duration = 0

    try {
      const distanceResult = await getDrivingDistanceKmSmart(
        originLatitude,
        originLongitude,
        destinationLatitude,
        destinationLongitude,
        googleApiKey
      )
      distance = distanceResult.distance
      duration = distanceResult.durationMinutes
      console.log('Distance result (Haversine ≤5km else Matrix):', { distance, duration })
    } catch (error) {
      console.log('Error in distance calculation, using haversine fallback:', error)
      distance = haversineDistance(originLatitude, originLongitude, destinationLatitude, destinationLongitude)
      duration = Math.round((distance / 30) * 60) // Estimate duration based on 30 km/h average speed
      console.log('Haversine fallback distance result:', { distance, duration })
    }

    // Validate final distance
    if (distance <= 0) {
      console.warn('Invalid distance calculated, using fallback')
      distance = 10 // Default 10km fallback
      duration = 20 // Default 20 minutes fallback
    }

    const result = {
      success: true,
      calculation: {
        distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
        duration: Math.round(duration), // Round to nearest minute
        origin: {
          latitude: originLatitude,
          longitude: originLongitude
        },
        destination: {
          latitude: destinationLatitude,
          longitude: destinationLongitude
        },
        calculatedAt: new Date().toISOString()
      }
    }

    console.log('Distance calculation completed successfully:', result.calculation)
    return NextResponse.json(result)

  } catch (error) {
    console.error("Rider distance calculation error:", error)
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to calculate distance",
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Helper functions
function isValidCoordinates(lat: number, lng: number): boolean {
  return lat !== 0 && lng !== 0 && 
         lat >= -90 && lat <= 90 && 
         lng >= -180 && lng <= 180
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

