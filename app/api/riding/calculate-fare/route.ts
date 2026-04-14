import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { calculateFare } from "@/lib/fare-calculation-service"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    const {
      pickupLatitude,
      pickupLongitude,
      dropLatitude,
      dropLongitude,
      rideTypeId,
      useOptimizedRoute,
      waypoints,
    } = data

    if (!pickupLatitude || !pickupLongitude || !dropLatitude || !dropLongitude || !rideTypeId) {
      return NextResponse.json({ 
        error: "Missing required parameters: pickupLatitude, pickupLongitude, dropLatitude, dropLongitude, rideTypeId" 
      }, { status: 400 })
    }

    const result = await calculateFare({
      originLatitude: pickupLatitude,
      originLongitude: pickupLongitude,
      destinationLatitude: dropLatitude,
      destinationLongitude: dropLongitude,
      rideTypeId,
      useOptimizedRoute: useOptimizedRoute ?? false,
      waypoints: waypoints ?? undefined,
    })

    return NextResponse.json({
      success: true,
      data: {
        rideType: {
          id: result.rideType.id,
          name: result.rideType.name,
          basePrice: result.rideType.basePrice,
          pricePerKm: result.rideType.pricePerKm,
          pricePerMinute: result.rideType.pricePerMinute,
        },
        distance: {
          kilometers: Math.round(result.distance * 100) / 100,
          meters: Math.round(result.distance * 1000),
        },
        duration: {
          minutes: Math.ceil(result.duration / 60),
          seconds: Math.round(result.duration),
        },
        fare: {
          estimated: result.fare,
          basePrice: result.rideType.basePrice,
          pricePerKm: result.rideType.pricePerKm,
          pricePerMinute: result.rideType.pricePerMinute,
        },
        surgeMultiplier: 1.0,
        estimatedArrival: new Date(Date.now() + result.duration * 1000).toISOString(),
        route: result.route ?? null,
      }
    })
  } catch (error: any) {
    console.error("Ride estimation error:", error)
    return NextResponse.json({ error: error.message || "Failed to estimate ride" }, { status: 500 })
  }
}
