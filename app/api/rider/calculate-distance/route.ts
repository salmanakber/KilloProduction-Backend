import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { originAddress, destinationAddress, vehicleType, orderId, datalonAndlatLong } = body
  

    if (!originAddress || !destinationAddress) {
      return NextResponse.json(
        { error: "Origin and destination addresses are required" },
        { status: 400 }
      )
    }


    // Resolve coordinates for both addresses
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!googleApiKey) {
      console.warn("Google Maps API key not found")
      return NextResponse.json(
        { error: "Distance calculation service unavailable" },
        { status: 503 }
      )
    }

    let origin = null
    let dest = null
    if(datalonAndlatLong) {
      origin = await resolveCoordinates({ latitude: datalonAndlatLong.latitudeOrigin, longitude: datalonAndlatLong.longitudeOrigin }, googleApiKey)
      dest = await resolveCoordinates({ latitude: datalonAndlatLong.latitudeDestination, longitude: datalonAndlatLong.longitudeDestination }, googleApiKey)
    } else {
      origin = await resolveCoordinates(originAddress, googleApiKey)
      dest = await resolveCoordinates(destinationAddress, googleApiKey)
    }

    

    // Calculate distance using Google Distance Matrix API
    let distance = 0
    let duration = 0

    try {
      if (
        isValidCoordinates(origin.latitude, origin.longitude) &&
        isValidCoordinates(dest.latitude, dest.longitude)
      ) {
        
        const distanceResult = await getDrivingDistanceKm(
          origin.latitude,
          origin.longitude,
          dest.latitude,
          dest.longitude,
          googleApiKey
        )
        
        if (distanceResult) {
          distance = distanceResult.distance
          duration = distanceResult.duration
          console.log('Google Distance Matrix result:', { distance, duration })
        } else {
          throw new Error('Distance Matrix API returned no result')
        }
      } else {
        console.log('Invalid coordinates, using haversine distance calculation')
        distance = haversineDistance(origin.latitude, origin.longitude, dest.latitude, dest.longitude)
        duration = Math.round((distance / 30) * 60) // Estimate duration based on 30 km/h average speed
        console.log('Haversine distance result:', { distance, duration })
      }
    } catch (error) {
      console.log('Error in distance calculation, using haversine fallback:', error)
      distance = haversineDistance(origin.latitude, origin.longitude, dest.latitude, dest.longitude)
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
        vehicleType: vehicleType || 'DEFAULT',
        origin: {
          address: origin.fullAddress || originAddress,
          latitude: origin.latitude,
          longitude: origin.longitude
        },
        destination: {
          address: dest.fullAddress || destinationAddress,
          latitude: dest.latitude,
          longitude: dest.longitude
        },
        orderId: orderId || null,
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

async function getDrivingDistanceKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string
): Promise<{ distance: number; duration: number } | null> {
  try {
    console.log('Calling Google Distance Matrix API with coordinates:', {
      origin: { lat: originLat, lng: originLng },
      destination: { lat: destLat, lng: destLng }
    })
    
    const params = new URLSearchParams({
      origins: `${originLat},${originLng}`,
      destinations: `${destLat},${destLng}`,
      key: apiKey,
      mode: 'driving',
      units: 'metric'
    })
    
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`
    console.log('Distance Matrix API URL:', url)
    
    const res = await fetch(url)
    if (!res.ok) {
      console.error('Distance Matrix API request failed:', res.status, res.statusText)
      return null
    }
    
    const data = await res.json()
    console.log('Distance Matrix API response status:', data.status)
    
    if (data.status === 'OK' && data.rows?.length > 0 && data.rows[0].elements?.length > 0) {
      const element = data.rows[0].elements[0]
      
      if (element.status === 'OK') {
        const distanceKm = element.distance?.value ? element.distance.value / 1000 : 0
        const durationMinutes = element.duration?.value ? element.duration.value / 60 : 0
        
        console.log('Distance Matrix calculation successful:', {
          distance: distanceKm,
          duration: durationMinutes
        })
        
        return {
          distance: distanceKm,
          duration: durationMinutes
        }
      } else {
        console.error('Distance Matrix element status not OK:', element.status)
        return null
      }
    } else {
      console.error('Distance Matrix API returned invalid response structure')
      return null
    }
  } catch (error) {
    console.error('Error calling Distance Matrix API:', error)
    return null
  }
}

async function resolveCoordinates(
  address: any,
  apiKey: string
): Promise<{ latitude: number; longitude: number; fullAddress?: string }> {
  console.log('Resolving coordinates for address:', address, 'Type:', typeof address)
  
  if (address && typeof address === 'object') {
    const lat = address.latitude ?? address.lat
    const lng = address.longitude ?? address.lng
    if (typeof lat === 'number' && typeof lng === 'number') {
      console.log('Using existing coordinates:', { lat, lng })
      return { latitude: lat, longitude: lng, fullAddress: address.fullAddress || address.address }
    }
  }
  
  if (typeof address === 'string' && apiKey) {
    console.log('Geocoding string address:', address)
    const params = new URLSearchParams({ address, key: apiKey })
    const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
    
    try {
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        console.log('Geocoding response status:', data.status)
        console.log('Geocoding results count:', data.results?.length || 0)
        
        const loc = data?.results?.[0]?.geometry?.location
        if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
          console.log('Successfully resolved coordinates:', { lat: loc.lat, lng: loc.lng })
          return { 
            latitude: loc.lat, 
            longitude: loc.lng, 
            fullAddress: data?.results?.[0]?.formatted_address 
          }
        } else {
          console.log('No valid coordinates found in geocoding response')
        }
      } else {
        console.log('Geocoding API request failed:', res.status, res.statusText)
      }
    } catch (error) {
      console.error('Error calling geocoding API:', error)
    }
  }
  
  console.log('Returning fallback coordinates (0,0) for address:', address)
  return { latitude: 0, longitude: 0, fullAddress: typeof address === 'string' ? address : address?.fullAddress }
}
