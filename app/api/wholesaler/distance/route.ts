import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"

async function getDrivingDistanceKm(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
  ): Promise<{ distance: number; duration: number } | null> {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      console.warn("Google Maps API key not found")
      return null
    }
  
    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&mode=driving&key=${process.env.GOOGLE_MAPS_API_KEY}`
      
      
      const response = await fetch(url)
      
      if (!response.ok) {
        console.error("Distance Matrix API error:", response.status, response.statusText)
        return null
      }
  
      const data = await response.json()
      
      
      if (data.status === "OK" && data.rows.length > 0 && data.rows[0].elements.length > 0) {
        const element = data.rows[0].elements[0]
        
        if (element.status === "OK") {
          return {
            distance: element.distance.value / 1000, // Convert meters to km
            duration: element.duration.value / 60 // Convert seconds to minutes
          }
        }
      }
      
      
      return null
    } catch (error) {
      console.error("Error calculating driving distance:", error)
      return null
    }
  }

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { deliveryAddress, wholesalerAddress } = await request.json()

  if (!deliveryAddress || !wholesalerAddress) {
    return NextResponse.json({ error: "Both deliveryAddress and wholesalerAddress are required" }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Google Maps API key not found" }, { status: 500 })
  }

  try {
    // 1️⃣ Geocode both addresses
    const geocode = async (address: string) => {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`)
      const data = await res.json()
      if (data.status !== "OK" || !data.results || data.results.length === 0) {
        throw new Error(`Failed to geocode address: ${address}`)
      }
      return data.results[0].geometry.location // { lat, lng }
    }

    const [origin, destination] = await Promise.all([
      geocode(wholesalerAddress),
      geocode(deliveryAddress)
    ])

    

    const distanceData = await getDrivingDistanceKm(origin.lat, origin.lng, destination.lat, destination.lng)
    
    
    if (!distanceData) {
      
      return NextResponse.json({ 
        error: "Unable to calculate driving distance between the addresses" 
      }, { status: 400 })
    }

    return NextResponse.json({
      distance: distanceData.distance,
      duration: distanceData.duration,
      units: {
        distance: "kilometers",
        duration: "minutes"
      },
      coordinates: {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng }
      }
    })
  } catch (error) {
    console.error("Error calculating distance:", error)
    return NextResponse.json({ error: "Failed to calculate distance", details: error }, { status: 500 })
  }
}
