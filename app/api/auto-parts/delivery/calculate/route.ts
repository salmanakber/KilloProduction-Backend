import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { calculateFare } from "@/lib/fare-calculation-service"

/**
 * Same fare engine as grocery/food delivery preview (`/grocery/delivery/calculate`, `/food/delivery/calculate`).
 * Checkout still recomputes on `/auto-parts/checkout` with `applyClientDeliveryChargeIfProvided` for the authorized amount.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { storeLatitude, storeLongitude, customerLatitude, customerLongitude, waypoints, useOptimizedRoute } = body

    if (!storeLatitude || !storeLongitude || !customerLatitude || !customerLongitude) {
      return NextResponse.json({ error: "All coordinates are required" }, { status: 400 })
    }

    const result = await calculateFare({
      originLatitude: storeLatitude,
      originLongitude: storeLongitude,
      destinationLatitude: customerLatitude,
      destinationLongitude: customerLongitude,
      category: "COURIER",
      vehicleType: "MOTORCYCLE",
      useOptimizedRoute: useOptimizedRoute || false,
      waypoints: waypoints || undefined,
    })

    return NextResponse.json({
      distance: result.distance,
      duration: result.duration,
      fare: result.fare,
      rideType: result.rideType,
      route: result.route,
    })
  } catch (error: unknown) {
    console.error("Auto parts delivery calculation error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to calculate delivery" },
      { status: 500 }
    )
  }
}
