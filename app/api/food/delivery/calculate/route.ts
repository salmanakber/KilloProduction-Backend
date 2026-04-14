import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { restaurantLatitude, restaurantLongitude, customerLatitude, customerLongitude } = body
    console.log(restaurantLatitude, restaurantLongitude, customerLatitude, customerLongitude)
    if (!restaurantLatitude || !restaurantLongitude || !customerLatitude || !customerLongitude) {
      console.log("All coordinates are required")
      return NextResponse.json(
        { error: "All coordinates are required" },
        { status: 400 }
      )
    }

    // Get ride type for COURIER category with MOTORCYCLE vehicle type
    const rideType = await prisma.rideType.findFirst({
      where: {
        category: "COURIER",
        vehicleType: "MOTORCYCLE",
        isActive: true,
      },
    })

    if (!rideType) {
      console.log("Courier ride type not configured")
      return NextResponse.json(
        { error: "Courier ride type not configured" },
        { status: 404 }
      )
    }

    // Calculate distance using Google Maps Distance Matrix API
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Maps API key not configured" },
        { status: 500 }
      )
    }

    const params = new URLSearchParams({
      origins: `${restaurantLatitude},${restaurantLongitude}`,
      destinations: `${customerLatitude},${customerLongitude}`,
      key: apiKey,
      mode: 'driving',
      units: 'metric'
    })

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`
    const response = await fetch(url)
    
    if (!response.ok) {
      return NextResponse.json(
        { error: "Distance calculation service unavailable" },
        { status: 503 }
      )
    }

    const data = await response.json()

    if (data.status !== 'OK' || !data.rows?.[0]?.elements?.[0]) {
      console.log("Could not calculate distance")
      return NextResponse.json(
        { error: "Could not calculate distance" },
        { status: 400 }
      )
    }

    const element = data.rows[0].elements[0]
    if (element.status !== 'OK') {
      console.log("Route not found")
      return NextResponse.json(
        { error: "Route not found" },
        { status: 400 }
      )
    }

    const distanceKm = element.distance.value / 1000 // Convert meters to km
    const durationSeconds = element.duration.value

    // Calculate fare using ride type pricing
    const fare = calculateFare(rideType, distanceKm, durationSeconds)

    return NextResponse.json({
      distance: distanceKm,
      duration: durationSeconds,
      fare,
      rideType: {
        id: rideType.id,
        name: rideType.name,
        basePrice: rideType.basePrice,
        pricePerKm: rideType.pricePerKm,
        pricePerMinute: rideType.pricePerMinute,
      }
    })
  } catch (error: any) {
    console.error("Delivery calculation error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to calculate delivery" },
      { status: 500 }
    )
  }
}

function calculateFare(rideType: any, distanceKm: number, durationSeconds: number): number {
  const basePrice = rideType.basePrice || 0
  const pricePerKm = rideType.pricePerKm || 0
  const pricePerMinute = rideType.pricePerMinute || 0
  const durationMinutes = durationSeconds / 60

  const fare = basePrice + (pricePerKm * distanceKm) + (pricePerMinute * durationMinutes)
  return Math.round(fare * 100) / 100 // Round to 2 decimal places
}
