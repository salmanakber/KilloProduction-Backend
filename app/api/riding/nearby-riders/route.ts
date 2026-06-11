import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { Prisma } from "@prisma/client"

// Haversine formula to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c // Distance in meters
}

// Convert meters to kilometers
function metersToKm(meters: number): number {
  return meters / 1000
}

// Check if location is recent (within last 10 minutes)
function isLocationRecent(lastUpdate: Date | null): boolean {
  if (!lastUpdate) return false
  const now = new Date()
  const diffMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60)
  return diffMinutes <= 10
}

// Enhanced distance calculation using Google Maps API
async function getDrivingDistance(
  originLat: number, 
  originLng: number, 
  destLat: number, 
  destLng: number
): Promise<{ distance: number; duration: number } | null> {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      
      return null
    }

    const origin = `${originLat},${originLng}`
    const destination = `${destLat},${destLng}`
    
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&units=metric&key=${apiKey}`
    
    const response = await fetch(url)
    const data = await response.json()
    
    if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
      const element = data.rows[0].elements[0]
      return {
        distance: element.distance.value, // Distance in meters
        duration: element.duration.value   // Duration in seconds
      }
    }
    
    
    return null
  } catch (error) {
    console.error('❌ Error calling Google Maps API:', error)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const latitude = parseFloat(searchParams.get('latitude') || '0')
    const longitude = parseFloat(searchParams.get('longitude') || '0')
    const maxDistance = parseFloat(searchParams.get('maxDistance') || '10') // Default 10km
    const vehicleType = searchParams.get('vehicleType') // Optional filter by vehicle type
    const limit = parseInt(searchParams.get('limit') || '50')
    const useGoogleMaps = searchParams.get('useGoogleMaps') === 'true' // Optional Google Maps integration

    // Validate coordinates
    if (!latitude || !longitude || latitude === 0 || longitude === 0) {
      return NextResponse.json({ 
        error: "Valid latitude and longitude are required" 
      }, { status: 400 })
    }

    // Validate distance range
    if (maxDistance < 0.1 || maxDistance > 50) {
      return NextResponse.json({ 
        error: "Max distance must be between 0.1 and 50 kilometers" 
      }, { status: 400 })
    }

    

    // Fetch all available riders with their profiles
    const riders = await prisma.riderProfile.findMany({
      where: {
        isAvailable: true,
        status: 'APPROVED', // Only approved riders
        currentLocation: {
            not: Prisma.DbNull as any, // Must have location data
        },
        lastLocationUpdate: {
          gte: new Date(Date.now() - 10 * 60 * 1000) // Location updated within last 10 minutes
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            avatar: true,
          }
        }
      },
      take: 200 // Get more than needed for filtering
    })

    

    // Filter riders by distance and other criteria
    const nearbyRiders: any[] = []
    
    for (const rider of riders) {
      const location = rider.currentLocation as any
      
      // Skip if location data is invalid
      if (!location || !location.latitude || !location.longitude) {
        continue
      }

      // Calculate initial distance using Haversine
      const haversineDistanceMeters = calculateDistance(
        latitude,
        longitude,
        location.latitude,
        location.longitude
      )
      const haversineDistanceKm = metersToKm(haversineDistanceMeters)

      // Skip if outside range (using Haversine for initial filtering)
      if (haversineDistanceKm > maxDistance) {
        continue
      }

      // Filter by vehicle type if specified
      if (vehicleType && rider.vehicleType !== vehicleType) {
        continue
      }

      let finalDistance = haversineDistanceMeters
      let drivingDuration: number | null = null

      // Use Google Maps API for more accurate distance if requested
      if (useGoogleMaps && haversineDistanceKm <= 5) { // Only for nearby riders to avoid API limits
        const googleResult = await getDrivingDistance(
          latitude,
          longitude,
          location.latitude,
          location.longitude
        )
        
        if (googleResult) {
          finalDistance = googleResult.distance
          drivingDuration = googleResult.duration
        }
      }

      const finalDistanceKm = metersToKm(finalDistance)

      // Double-check distance with final calculation
      if (finalDistanceKm > maxDistance) {
        continue
      }

      nearbyRiders.push({
        id: rider.id,
        userId: rider.userId,
        name: rider.user.name || 'Unknown Rider',
        phone: rider.user.phone || '',
        avatar: rider.user.avatar,
        vehicleType: rider.vehicleType,
        vehicleBrand: rider.vehicleBrand,
        vehicleModel: rider.vehicleModel,
        vehicleColor: rider.vehicleColor,
        licensePlate: rider.licensePlate,
        rating: rider.rating,
        totalRides: rider.totalRides,
        totalDeliveries: rider.totalDeliveries,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          heading: location.heading,
          speed: location.speed,
          timestamp: location.timestamp
        },
        distance: {
          meters: Math.round(finalDistance),
          kilometers: Math.round(finalDistanceKm * 100) / 100, // Round to 2 decimal places
          haversineKm: Math.round(haversineDistanceKm * 100) / 100,
          isGoogleMaps: useGoogleMaps && finalDistance !== haversineDistanceMeters
        },
        drivingTime: drivingDuration ? Math.round(drivingDuration / 60) : null, // Convert to minutes
        lastLocationUpdate: rider.lastLocationUpdate,
        isLocationRecent: isLocationRecent(rider.lastLocationUpdate)
      })
    }

    // Sort by distance and limit results
    nearbyRiders.sort((a, b) => a.distance.meters - b.distance.meters)
    const limitedRiders = nearbyRiders.slice(0, limit)

    

    // Calculate statistics
    const stats = {
      totalFound: limitedRiders.length,
      maxDistance: maxDistance,
      searchCenter: { latitude, longitude },
      averageDistance: limitedRiders.length > 0 
        ? Math.round(limitedRiders.reduce((sum, rider) => sum + rider.distance.kilometers, 0) / limitedRiders.length * 100) / 100
        : 0,
      vehicleTypes: [...new Set(limitedRiders.map(rider => rider.vehicleType))],
      ridersWithRecentLocation: limitedRiders.filter(rider => rider.isLocationRecent).length,
      googleMapsUsed: useGoogleMaps,
      ridersWithGoogleMapsDistance: limitedRiders.filter(rider => rider.distance.isGoogleMaps).length
    }

    return NextResponse.json({
      success: true,
      data: {
        riders: limitedRiders,
        stats,
        searchParams: {
          latitude,
          longitude,
          maxDistance,
          vehicleType: vehicleType || 'all',
          limit,
          useGoogleMaps
        }
      }
    })

  } catch (error) {
    console.error("❌ Error fetching nearby riders:", error)
    return NextResponse.json({ 
      success: false,
      error: "Failed to fetch nearby riders" 
    }, { status: 500 })
  }
}

// POST endpoint for more complex queries (e.g., multiple locations, advanced filtering)
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { 
      locations, // Array of {latitude, longitude, maxDistance}
      vehicleTypes, // Array of vehicle types to filter by
      minRating,
      maxRides,
      includeStats = true,
      useGoogleMaps = false
    } = body

    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return NextResponse.json({ 
        error: "Locations array is required" 
      }, { status: 400 })
    }

    // Build where clause for advanced filtering
    const whereClause: any = {
      isAvailable: true,
      status: 'APPROVED',
      currentLocation: { not: null },
      lastLocationUpdate: {
        gte: new Date(Date.now() - 10 * 60 * 1000)
      }
    }

    if (vehicleTypes && vehicleTypes.length > 0) {
      whereClause.vehicleType = { in: vehicleTypes }
    }

    if (minRating !== undefined) {
      whereClause.rating = { gte: minRating }
    }

    if (maxRides !== undefined) {
      whereClause.totalRides = { lte: maxRides }
    }

    // Fetch riders with advanced filtering
    const riders = await prisma.riderProfile.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            avatar: true,
          }
        }
      },
      take: 500
    })

    // Process each location
    const results = await Promise.all(locations.map(async (location: any) => {
      const { latitude, longitude, maxDistance = 10 } = location
      
      const nearbyRiders = []
      
      for (const rider of riders) {
        const riderLocation = rider.currentLocation as any
        
        if (!riderLocation || !riderLocation.latitude || !riderLocation.longitude) {
          continue
        }

        const haversineDistanceMeters = calculateDistance(
          latitude,
          longitude,
          riderLocation.latitude,
          riderLocation.longitude
        )
        const haversineDistanceKm = metersToKm(haversineDistanceMeters)

        if (haversineDistanceKm > maxDistance) {
          continue
        }

        let finalDistance = haversineDistanceMeters
        let drivingDuration = null

        // Use Google Maps API for more accurate distance if requested
        if (useGoogleMaps && haversineDistanceKm <= 5) {
          const googleResult = await getDrivingDistance(
            latitude,
            longitude,
            riderLocation.latitude,
            riderLocation.longitude
          )
          
          if (googleResult) {
            finalDistance = googleResult.distance
            drivingDuration = googleResult.duration
          }
        }

        const finalDistanceKm = metersToKm(finalDistance)

        if (finalDistanceKm > maxDistance) {
          continue
        }

        nearbyRiders.push({
          id: rider.id,
          userId: rider.userId,
          name: rider.user.name || 'Unknown Rider',
          phone: rider.user.phone || '',
          avatar: rider.user.avatar,
          vehicleType: rider.vehicleType,
          vehicleBrand: rider.vehicleBrand,
          vehicleModel: rider.vehicleModel,
          vehicleColor: rider.vehicleColor,
          licensePlate: rider.licensePlate,
          rating: rider.rating,
          totalRides: rider.totalRides,
          totalDeliveries: rider.totalDeliveries,
          location: {
            latitude: riderLocation.latitude,
            longitude: riderLocation.longitude,
            accuracy: riderLocation.accuracy,
            heading: riderLocation.heading,
            speed: riderLocation.speed,
            timestamp: riderLocation.timestamp
          },
          distance: {
            meters: Math.round(finalDistance),
            kilometers: Math.round(finalDistanceKm * 100) / 100,
            haversineKm: Math.round(haversineDistanceKm * 100) / 100,
            isGoogleMaps: useGoogleMaps && finalDistance !== haversineDistanceMeters
          },
          drivingTime: drivingDuration ? Math.round(drivingDuration / 60) : null,
          lastLocationUpdate: rider.lastLocationUpdate,
          isLocationRecent: isLocationRecent(rider.lastLocationUpdate)
        })
      }

      // Sort by distance
      nearbyRiders.sort((a, b) => a.distance.meters - b.distance.meters)

      return {
        location: { latitude, longitude, maxDistance },
        riders: nearbyRiders,
        count: nearbyRiders.length
      }
    }))

    return NextResponse.json({
      success: true,
      data: {
        results,
        totalRidersFound: results.reduce((sum, result) => sum + result.count, 0),
        searchParams: {
          locationsCount: locations.length,
          vehicleTypes: vehicleTypes || 'all',
          minRating,
          maxRides,
          includeStats,
          useGoogleMaps
        }
      }
    })

  } catch (error) {
    console.error("❌ Error in advanced nearby riders search:", error)
    return NextResponse.json({ 
      success: false,
      error: "Failed to perform advanced nearby riders search" 
    }, { status: 500 })
  }
}