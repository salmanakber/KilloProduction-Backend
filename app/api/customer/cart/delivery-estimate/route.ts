import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { 
      pharmacyIds, // Array of pharmacy IDs
      addressId,   // Customer delivery address ID
      pickupLatitude,
      pickupLongitude,
      dropLatitude,
      dropLongitude
    } = body

    // Get customer address if addressId provided
    let finalDropLatitude = dropLatitude
    let finalDropLongitude = dropLongitude
    
    if (addressId && !dropLatitude && !dropLongitude) {
      const address = await prisma.address.findUnique({
        where: { id: addressId, userId: user.id }
      })
      if (address) {
        finalDropLatitude = address.latitude
        finalDropLongitude = address.longitude
      }
    }

    if (!pharmacyIds || pharmacyIds.length === 0) {
      return NextResponse.json({ error: "Pharmacy IDs are required" }, { status: 400 })
    }

    if (!finalDropLatitude || !finalDropLongitude) {
      return NextResponse.json({ error: "Delivery address coordinates are required" }, { status: 400 })
    }

    // Fetch pharmacy coordinates
    const pharmacies = await prisma.pharmacy.findMany({
      where: { id: { in: pharmacyIds } },
      select: {
        id: true,
        lat: true,
        lon: true,
        address: true
      }
    })

    if (pharmacies.length === 0) {
      return NextResponse.json({ error: "No pharmacies found" }, { status: 404 })
    }

    // Determine pickup coordinates (use first pharmacy or provided coordinates)
    let finalPickupLatitude = pickupLatitude
    let finalPickupLongitude = pickupLongitude

    if (!finalPickupLatitude || !finalPickupLongitude) {
      // Use first pharmacy coordinates
      const firstPharmacy = pharmacies[0]
      finalPickupLatitude = firstPharmacy.lat
      finalPickupLongitude = firstPharmacy.lon

      // If pharmacy coordinates missing, geocode
      if (!finalPickupLatitude || !finalPickupLongitude) {
        const coords = await resolveCoordinates(firstPharmacy.address, process.env.GOOGLE_MAPS_API_KEY)
        finalPickupLatitude = coords.latitude
        finalPickupLongitude = coords.longitude
      }
    }

    if (!finalPickupLatitude || !finalPickupLongitude) {
      return NextResponse.json({ error: "Pickup coordinates are required" }, { status: 400 })
    }

    // Get COURIER ride types with vehicle types: SCOOTER, MOTORCYCLE, BICYCLE
    const eligibleRideTypes = await prisma.rideType.findMany({
      where: {
        category: "COURIER",
        vehicleType: {
          in: ["SCOOTER", "MOTORCYCLE", "BICYCLE"]
        },
        isActive: true
      },
      select: {
        id: true,
        name: true,
        basePrice: true,
        pricePerKm: true,
        pricePerMinute: true,
        vehicleType: true
      }
    })

    if (eligibleRideTypes.length === 0) {
      return NextResponse.json({ 
        error: "No courier ride types available for medicine delivery" 
      }, { status: 404 })
    }

    // Calculate average pricing from all eligible ride types
    const avgBasePrice = eligibleRideTypes.reduce((sum, rt) => sum + rt.basePrice, 0) / eligibleRideTypes.length
    const avgPricePerKm = eligibleRideTypes.reduce((sum, rt) => sum + rt.pricePerKm, 0) / eligibleRideTypes.length
    const avgPricePerMinute = eligibleRideTypes.reduce((sum, rt) => sum + (rt.pricePerMinute || 0), 0) / eligibleRideTypes.length

    // Calculate distance and duration
    const distanceData = await getDrivingDistance(
      finalPickupLatitude,
      finalPickupLongitude,
      finalDropLatitude,
      finalDropLongitude
    )

    if (!distanceData) {
      return NextResponse.json({ error: "Unable to calculate distance" }, { status: 500 })
    }

    const distanceKm = distanceData.distance
    const durationMinutes = Math.ceil(distanceData.duration / 60)

    // Calculate estimated fare using average pricing
    const estimatedFare = calculateFare({
      basePrice: avgBasePrice,
      pricePerKm: avgPricePerKm,
      pricePerMinute: avgPricePerMinute
    }, distanceKm, distanceData.duration)

    // Get best price (cheapest option)
    const bestRideType = eligibleRideTypes.reduce((best, current) => {
      const bestPrice = calculateFare(best, distanceKm, distanceData.duration)
      const currentPrice = calculateFare(current, distanceKm, distanceData.duration)
      return currentPrice < bestPrice ? current : best
    })

    const bestPrice = calculateFare(bestRideType, distanceKm, distanceData.duration)

    return NextResponse.json({
      success: true,
      data: {
        distance: distanceKm,
        estimatedArrivalMinutes: durationMinutes,
        deliveryCharge: estimatedFare,
        bestPrice: bestPrice,
        averagePricing: {
          basePrice: avgBasePrice,
          pricePerKm: avgPricePerKm,
          pricePerMinute: avgPricePerMinute
        },
        bestRideType: {
          id: bestRideType.id,
          name: bestRideType.name,
          vehicleType: bestRideType.vehicleType,
          basePrice: bestRideType.basePrice,
          pricePerKm: bestRideType.pricePerKm,
          pricePerMinute: bestRideType.pricePerMinute
        },
        availableRideTypes: eligibleRideTypes.length,
        pharmacyCount: pharmacies.length
      }
    })

  } catch (error: any) {
    console.error("Delivery estimate error:", error)
    return NextResponse.json(
      { error: "Failed to calculate delivery estimate", details: error.message },
      { status: 500 }
    )
  }
}

async function getDrivingDistance(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<{ distance: number; duration: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    console.error("Google Maps API key not configured")
    return null
  }

  try {
    const origin = `${originLat},${originLng}`
    const destination = `${destLat},${destLng}`
    
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&units=metric&key=${apiKey}`
    
    const response = await fetch(url)
    if (!response.ok) {
      console.error("Distance Matrix API error:", response.status)
      return null
    }

    const data = await response.json()
    
    if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
      const element = data.rows[0].elements[0]
      return {
        distance: element.distance.value / 1000, // Convert meters to kilometers
        duration: element.duration.value // Duration in seconds
      }
    }
    
    return null
  } catch (error) {
    console.error("Error calling Distance Matrix API:", error)
    return null
  }
}

function calculateFare(
  rideType: { basePrice: number; pricePerKm: number; pricePerMinute: number },
  distanceKm: number,
  durationSeconds: number
): number {
  const durationMinutes = durationSeconds / 60
  
  let fare = rideType.basePrice
  
  // Add distance-based pricing
  fare += distanceKm * rideType.pricePerKm
  
  // Add time-based pricing if applicable
  if (rideType.pricePerMinute > 0) {
    fare += durationMinutes * rideType.pricePerMinute
  }
  
  // Round to 2 decimal places
  return Math.round(fare * 100) / 100
}

async function resolveCoordinates(
  address: any,
  apiKey?: string
): Promise<{ latitude: number; longitude: number; fullAddress?: string }> {
  if (address && typeof address === 'object') {
    const lat = address.latitude ?? address.lat
    const lng = address.longitude ?? address.lng
    if (typeof lat === 'number' && typeof lng === 'number') {
      return { latitude: lat, longitude: lng, fullAddress: address.fullAddress || address.address }
    }
  }
  
  if (typeof address === 'string' && apiKey) {
    try {
      const params = new URLSearchParams({ address, key: apiKey })
      const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        const loc = data?.results?.[0]?.geometry?.location
        if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
          return { latitude: loc.lat, longitude: loc.lng, fullAddress: data?.results?.[0]?.formatted_address }
        }
      }
    } catch (err) {
      console.error('Geocoding error:', err)
    }
  }
  
  return { latitude: 0, longitude: 0, fullAddress: typeof address === 'string' ? address : address?.fullAddress }
}

