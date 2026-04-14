import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  calculateRouteAndFee,
  type PickupPoint,
  type DropoffPoint,
  calculateFallbackRoute,
  calculateDeliveryFee,
} from '@/lib/multi-pickup-route.service'

/**
 * POST /api/delivery/route/calculate
 * 
 * Calculate optimized delivery route for single or multiple pickup points
 * 
 * Request body:
 * {
 *   pickupPoints: [
 *     {
 *       id: "store-id",
 *       name: "Store Name",
 *       address: "Store Address",
 *       latitude: 6.5244,
 *       longitude: 3.3792,
 *       module: "GROCERY" | "FOOD" | "PHARMACY",
 *       storeType: "GROCERY_STORE" | "RESTAURANT" | "PHARMACY"
 *     }
 *   ],
 *   dropoffPoint: {
 *     id: "address-id",
 *     address: "Customer Address",
 *     latitude: 6.4550,
 *     longitude: 3.4738
 *   },
 *   module: "GROCERY" | "FOOD" | "PHARMACY" // For ride type selection
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   route: {
 *     pickupPoints: [...], // Ordered by optimization
 *     dropoffPoint: {...},
 *     segments: [...],
 *     totalDistance: 15.5,
 *     totalDuration: 1800,
 *     estimatedDeliveryTime: 30,
 *     routePolyline: "...",
 *     waypointOrder: [0, 2, 1]
 *   },
 *   deliveryFee: {
 *     basePrice: 500,
 *     pricePerKm: 100,
 *     pricePerMinute: 10,
 *     distanceFee: 1550,
 *     timeFee: 300,
 *     totalFee: 2350
 *   },
 *   isValid: true
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { pickupPoints, dropoffPoint, module = 'GROCERY' } = body

    // Validation
    if (!pickupPoints || !Array.isArray(pickupPoints) || pickupPoints.length === 0) {
      return NextResponse.json(
        { error: 'At least one pickup point is required' },
        { status: 400 }
      )
    }

    if (!dropoffPoint || !dropoffPoint.latitude || !dropoffPoint.longitude) {
      return NextResponse.json(
        { error: 'Valid dropoff point with coordinates is required' },
        { status: 400 }
      )
    }

    // Validate pickup points
    for (const pickup of pickupPoints) {
      if (!pickup.latitude || !pickup.longitude || !pickup.id || !pickup.name) {
        return NextResponse.json(
          { error: 'Each pickup point must have id, name, latitude, and longitude' },
          { status: 400 }
        )
      }
    }

    // Get ride type based on module
    const rideType = await prisma.rideType.findFirst({
      where: {
        category: 'COURIER',
        vehicleType: 'MOTORCYCLE',
        isActive: true,
      },
    })

    if (!rideType) {
      return NextResponse.json(
        { error: 'Courier ride type not configured' },
        { status: 404 }
      )
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY

    // Convert to service types
    const servicePickupPoints: PickupPoint[] = pickupPoints.map((p: any) => ({
      id: p.id,
      name: p.name,
      address: p.address || p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      module: p.module || module,
      storeType: p.storeType,
    }))

    // console.log('servicePickupPoints', rideType)

    const serviceDropoffPoint: DropoffPoint = {
      id: dropoffPoint.id,
      address: dropoffPoint.address || 'Delivery Address',
      latitude: dropoffPoint.latitude,
      longitude: dropoffPoint.longitude,
    }

    // Calculate route and fee
    let result
    if (apiKey) {
      result = await calculateRouteAndFee(
        servicePickupPoints,
        serviceDropoffPoint,
        {
          basePrice: rideType.basePrice ?? 0,
          pricePerKm: rideType.pricePerKm ?? 0,
          pricePerMinute: rideType.pricePerMinute ?? 0,
        },
        apiKey
      )
    } else {
      // Fallback calculation without API
      const fallbackRoute = calculateFallbackRoute(servicePickupPoints, serviceDropoffPoint)
      const deliveryFee = calculateDeliveryFee(fallbackRoute, {
        basePrice: rideType.basePrice ?? 0,
        pricePerKm: rideType.pricePerKm ?? 0,
        pricePerMinute: rideType.pricePerMinute ?? 0,
      })

      result = {
        route: fallbackRoute,
        deliveryFee,
        isValid: true,
      }
    }

    if (!result.isValid) {
      return NextResponse.json(
        { error: result.error || 'Failed to calculate route' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      route: result.route,
      deliveryFee: result.deliveryFee,
      isValid: true,
      rideType: {
        id: rideType.id,
        name: rideType.name,
        basePrice: rideType.basePrice,
        pricePerKm: rideType.pricePerKm,
        pricePerMinute: rideType.pricePerMinute,
      },
    })
  } catch (error) {
    console.error('Route calculation error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to calculate route',
      },
      { status: 500 }
    )
  }
}
