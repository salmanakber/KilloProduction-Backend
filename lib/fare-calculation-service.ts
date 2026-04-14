import { prisma } from '@/lib/prisma'

export interface FareCalculationParams {
  originLatitude: number
  originLongitude: number
  destinationLatitude: number
  destinationLongitude: number
  rideTypeId?: string
  category?: string
  vehicleType?: string
  useOptimizedRoute?: boolean // Use Directions API for better route
  waypoints?: Array<{ latitude: number; longitude: number }> // For multi-pickup routes
}

export interface FareCalculationResult {
  distance: number // in km
  duration: number // in seconds
  fare: number
  rideType: {
    id: string
    name: string
    basePrice: number | null
    pricePerKm: number | null
    pricePerMinute: number | null
  }
  route?: {
    polyline: string
    bounds?: {
      northeast: { lat: number; lng: number }
      southwest: { lat: number; lng: number }
    }
  }
}

/**
 * Calculate fare using Google Maps APIs
 * Uses Distance Matrix API for simple calculations
 * Uses Directions API for optimized routes with waypoints
 */
export async function calculateFare(params: FareCalculationParams): Promise<FareCalculationResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    throw new Error('Google Maps API key not configured')
  }

  // Get or find ride type
  let rideType
  if (params.rideTypeId) {
    rideType = await prisma.rideType.findUnique({
      where: { id: params.rideTypeId, isActive: true }
    })
  } else {
    rideType = await prisma.rideType.findFirst({
      where: {
        ...(params.category && { category: params.category as any }),
        ...(params.vehicleType && { vehicleType: params.vehicleType as any }),
        isActive: true
      }
    })
  }

  if (!rideType) {
    throw new Error('Ride type not found or not configured')
  }

  // Use Directions API if waypoints are provided or optimized route is requested
  const useDirectionsAPI = params.useOptimizedRoute || (params.waypoints && params.waypoints.length > 0)

  if (useDirectionsAPI) {
    return calculateFareWithDirections(params, rideType, apiKey)
  } else {
    return calculateFareWithDistanceMatrix(params, rideType, apiKey)
  }
}

/**
 * Calculate distance using Haversine formula (fallback when API fails)
 */
function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Calculate fare using Distance Matrix API (faster, simpler)
 */
async function calculateFareWithDistanceMatrix(
  params: FareCalculationParams,
  rideType: any,
  apiKey: string
): Promise<FareCalculationResult> {
  const paramsObj = new URLSearchParams({
    origins: `${params.originLatitude},${params.originLongitude}`,
    destinations: `${params.destinationLatitude},${params.destinationLongitude}`,
    key: apiKey,
    mode: 'driving',
    units: 'metric',
  })

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${paramsObj.toString()}`
  const res = await fetch(url)
  
  if (!res.ok) {
    // Fallback to Haversine calculation
    console.warn('Distance Matrix API unavailable, using Haversine fallback')
    return calculateFareWithHaversine(params, rideType)
  }

  const data = await res.json()
  
  // Handle various API response statuses
  if (data.status === 'ZERO_RESULTS' || data.status === 'NOT_FOUND') {
    console.warn('No route found in Distance Matrix API, using Haversine fallback')
    return calculateFareWithHaversine(params, rideType)
  }

  if (data.status !== 'OK' || !data.rows?.[0]?.elements?.[0]) {
    console.warn(`Distance Matrix API returned status: ${data.status}, using Haversine fallback`)
    return calculateFareWithHaversine(params, rideType)
  }

  const element = data.rows[0].elements[0]
  if (element.status !== 'OK') {
    // Handle element-level errors (ZERO_RESULTS, NOT_FOUND, etc.)
    if (element.status === 'ZERO_RESULTS' || element.status === 'NOT_FOUND') {
      console.warn('Route not found in Distance Matrix API, using Haversine fallback')
      return calculateFareWithHaversine(params, rideType)
    }
    console.warn(`Distance Matrix element status: ${element.status}, using Haversine fallback`)
    return calculateFareWithHaversine(params, rideType)
  }

  const distanceKm = element.distance.value / 1000
  const durationSeconds = element.duration.value
  const fare = calculateFareAmount(rideType, distanceKm, durationSeconds)

  return {
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
  }
}

/**
 * Fallback fare calculation using Haversine distance
 */
function calculateFareWithHaversine(
  params: FareCalculationParams,
  rideType: any
): FareCalculationResult {
  const distanceKm = calculateHaversineDistance(
    params.originLatitude,
    params.originLongitude,
    params.destinationLatitude,
    params.destinationLongitude
  )
  
  // Estimate duration: assume average speed of 30 km/h in urban areas
  const estimatedSpeedKmh = 30
  const durationSeconds = (distanceKm / estimatedSpeedKmh) * 3600
  
  const fare = calculateFareAmount(rideType, distanceKm, durationSeconds)

  return {
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
  }
}

/**
 * Calculate fare using Directions API (more accurate, supports waypoints)
 */
async function calculateFareWithDirections(
  params: FareCalculationParams,
  rideType: any,
  apiKey: string
): Promise<FareCalculationResult> {
  const paramsObj = new URLSearchParams({
    origin: `${params.originLatitude},${params.originLongitude}`,
    destination: `${params.destinationLatitude},${params.destinationLongitude}`,
    key: apiKey,
    mode: 'driving',
    units: 'metric',
    alternatives: 'false',
  })

  // Add waypoints if provided
  if (params.waypoints && params.waypoints.length > 0) {
    const waypointStr = params.waypoints
      .map(wp => `${wp.latitude},${wp.longitude}`)
      .join('|')
    paramsObj.append('waypoints', waypointStr)
    if (params.useOptimizedRoute) {
      paramsObj.append('optimize', 'true')
    }
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?${paramsObj.toString()}`
  const res = await fetch(url)
  
  if (!res.ok) {
    // Fallback to Distance Matrix or Haversine
    console.warn('Directions API unavailable, falling back to Distance Matrix')
    try {
      return await calculateFareWithDistanceMatrix(params, rideType, apiKey)
    } catch {
      return calculateFareWithHaversine(params, rideType)
    }
  }

  const data = await res.json()
  
  // Handle various API response statuses
  if (data.status === 'ZERO_RESULTS' || data.status === 'NOT_FOUND') {
    console.warn('No route found in Directions API, falling back to Distance Matrix')
    try {
      return await calculateFareWithDistanceMatrix(params, rideType, apiKey)
    } catch {
      return calculateFareWithHaversine(params, rideType)
    }
  }

  if (data.status !== 'OK' || !data.routes?.[0]) {
    console.warn(`Directions API returned status: ${data.status}, falling back to Distance Matrix`)
    try {
      return await calculateFareWithDistanceMatrix(params, rideType, apiKey)
    } catch {
      return calculateFareWithHaversine(params, rideType)
    }
  }

  const route = data.routes[0]
  
  // Sum up distance and duration from all legs
  let totalDistance = 0
  let totalDuration = 0
  
  for (const leg of route.legs) {
    totalDistance += leg.distance.value
    totalDuration += leg.duration.value
  }

  const distanceKm = totalDistance / 1000
  const durationSeconds = totalDuration
  const fare = calculateFareAmount(rideType, distanceKm, durationSeconds)

  return {
    distance: distanceKm,
    duration: durationSeconds,
    fare,
    rideType: {
      id: rideType.id,
      name: rideType.name,
      basePrice: rideType.basePrice,
      pricePerKm: rideType.pricePerKm,
      pricePerMinute: rideType.pricePerMinute,
    },
    route: {
      polyline: route.overview_polyline.points,
      bounds: route.bounds ? {
        northeast: {
          lat: route.bounds.northeast.lat,
          lng: route.bounds.northeast.lng
        },
        southwest: {
          lat: route.bounds.southwest.lat,
          lng: route.bounds.southwest.lng
        }
      } : undefined
    }
  }
}

/**
 * Calculate fare amount based on ride type pricing
 */
function calculateFareAmount(
  rideType: { basePrice?: number | null; pricePerKm?: number | null; pricePerMinute?: number | null },
  distanceKm: number,
  durationSeconds: number
): number {
  const base = rideType.basePrice ?? 0
  const perKm = rideType.pricePerKm ?? 0
  const perMin = rideType.pricePerMinute ?? 0
  const minutes = durationSeconds / 60
  
  const fare = base + (perKm * distanceKm) + (perMin * minutes)
  return Math.round(fare * 100) / 100
}
