import {
  HAVERSINE_ONLY_MAX_KM,
  haversineKm,
  haversineChainInputOrderKm,
} from "@/lib/delivery-distance-policy"

/**
 * Multi-Pickup Route Service
 * 
 * A reusable service for calculating optimized delivery routes with multiple pickup points.
 * Supports single and multiple pickup scenarios across different modules (Grocery, Food, Courier).
 * 
 * Features:
 * - Route optimization using Google Maps Directions API
 * - Distance and time calculation
 * - Delivery fee calculation based on optimized route
 * - Route polyline storage for rider navigation
 * - Support for unlimited pickup points
 */

export interface PickupPoint {
  id: string // Store/Restaurant ID
  name: string
  address: string
  latitude: number
  longitude: number
  module?: 'GROCERY' | 'FOOD' | 'PHARMACY' | 'COURIER' | 'AUTO_PARTS' // Module type for identification
  storeType?: 'GROCERY_STORE' | 'RESTAURANT' | 'PHARMACY' | 'AUTO_PARTS_STORE' // For database relations
}

export interface DropoffPoint {
  id?: string // Address ID
  address: string
  latitude: number
  longitude: number
}

export interface RouteSegment {
  from: PickupPoint | DropoffPoint
  to: PickupPoint | DropoffPoint
  distance: number // in kilometers
  duration: number // in seconds
  polyline?: string // Encoded polyline for the segment
}

export interface OptimizedRoute {
  pickupPoints: PickupPoint[] // Ordered by sequence
  dropoffPoint: DropoffPoint
  segments: RouteSegment[] // All route segments in order
  totalDistance: number // Total distance in kilometers
  totalDuration: number // Total duration in seconds
  estimatedDeliveryTime: number // Estimated delivery time in minutes
  routePolyline?: string // Full route polyline
  waypointOrder?: number[] // Google Maps waypoint order (for reference)
}

export interface DeliveryFeeCalculation {
  basePrice: number
  pricePerKm: number
  pricePerMinute: number
  distanceFee: number
  timeFee: number
  totalFee: number
}

export interface RouteCalculationResult {
  route: OptimizedRoute
  deliveryFee: DeliveryFeeCalculation
  isValid: boolean
  error?: string
}

/**
 * Calculate optimized route for multiple pickup points
 * Uses Google Maps Directions API with waypoint optimization
 * Falls back to Haversine calculation if API fails
 */
export type OptimizedRouteOptions = {
  /** When false, visits pickups in the given order (no Google optimize:true). Food multi-restaurant uses this after sorting by prep time. */
  optimizePickupOrder?: boolean
}

export async function calculateOptimizedRoute(
  pickupPoints: PickupPoint[],
  dropoffPoint: DropoffPoint,
  apiKey: string,
  options?: OptimizedRouteOptions
): Promise<OptimizedRoute | null> {
  try {
    if (pickupPoints.length === 0) {
      throw new Error('At least one pickup point is required')
    }

    const chainKm = haversineChainInputOrderKm(pickupPoints, dropoffPoint)
    if (chainKm <= HAVERSINE_ONLY_MAX_KM) {
      return calculateFallbackRoute(pickupPoints, dropoffPoint)
    }

    const optimizePickupOrder = options?.optimizePickupOrder !== false

    if (pickupPoints.length === 1) {
      // Single pickup - simple route calculation
      try {
        return await calculateSinglePickupRoute(pickupPoints[0], dropoffPoint, apiKey)
      } catch (error) {
        console.warn('Single pickup route API failed, using fallback:', error)
        // Fallback to Haversine
        return calculateFallbackRoute(pickupPoints, dropoffPoint)
      }
    }

    // Multiple pickups - use waypoint optimization (or fixed order for food prep sequencing)
    try {
      const result = await calculateMultiPickupRoute(pickupPoints, dropoffPoint, apiKey, optimizePickupOrder)
      console.log('result', result)
      return result
    } catch (error) {
      console.warn('Multi-pickup route API failed, using fallback:', error)
      // Fallback to Haversine
      const result = calculateFallbackRoute(pickupPoints, dropoffPoint)
      console.log('result fallback', result)
      return result
    }
  } catch (error) {
    console.error('Route calculation error:', error)
    // Final fallback
    return calculateFallbackRoute(pickupPoints, dropoffPoint)
  }
}

/**
 * Calculate route for single pickup point
 */
async function calculateSinglePickupRoute(
  pickup: PickupPoint,
  dropoff: DropoffPoint,
  apiKey: string
): Promise<OptimizedRoute> {
  // Validate coordinates
  if (!pickup.latitude || !pickup.longitude || !dropoff.latitude || !dropoff.longitude ||
      isNaN(pickup.latitude) || isNaN(pickup.longitude) ||
      isNaN(dropoff.latitude) || isNaN(dropoff.longitude)) {
    throw new Error('Invalid coordinates provided')
  }

  const params = new URLSearchParams({
    origin: `${pickup.latitude},${pickup.longitude}`,
    destination: `${dropoff.latitude},${dropoff.longitude}`,
    key: apiKey,
    mode: 'driving',
    units: 'metric',
    alternatives: 'false',
  })

  const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error('Directions API service unavailable')
  }
  
  const data = await response.json()

  // Handle various error statuses
  if (data.status === 'ZERO_RESULTS' || data.status === 'NOT_FOUND') {
    throw new Error(`ZERO_RESULTS`) // Trigger fallback
  }

  if (data.status !== 'OK' || !data.routes?.[0]) {
    throw new Error(`Directions API error: ${data.status}`)
  }

  const route = data.routes[0]
  const leg = route.legs[0]

  const segment: RouteSegment = {
    from: pickup,
    to: dropoff,
    distance: leg.distance.value / 1000, // Convert meters to km
    duration: leg.duration.value, // in seconds
    polyline: route.overview_polyline?.points,
  }

  return {
    pickupPoints: [pickup],
    dropoffPoint: dropoff,
    segments: [segment],
    totalDistance: leg.distance.value / 1000,
    totalDuration: leg.duration.value,
    estimatedDeliveryTime: Math.ceil(leg.duration.value / 60),
    routePolyline: route.overview_polyline?.points,
  }
}

/**
 * Calculate optimized route for multiple pickup points
 * Uses waypoint optimization to find the shortest route
 */
async function calculateMultiPickupRoute(
  pickups: PickupPoint[],
  dropoff: DropoffPoint,
  apiKey: string,
  optimizeWaypoints: boolean = true
): Promise<OptimizedRoute> {
  // Validate coordinates
  for (const pickup of pickups) {
    if (!pickup.latitude || !pickup.longitude || 
        isNaN(pickup.latitude) || isNaN(pickup.longitude) ||
        pickup.latitude < -90 || pickup.latitude > 90 ||
        pickup.longitude < -180 || pickup.longitude > 180) {
      throw new Error(`Invalid coordinates for pickup: ${pickup.name || 'unknown'}`)
    }
  }
  
  if (!dropoff.latitude || !dropoff.longitude || 
      isNaN(dropoff.latitude) || isNaN(dropoff.longitude) ||
      dropoff.latitude < -90 || dropoff.latitude > 90 ||
      dropoff.longitude < -180 || dropoff.longitude > 180) {
    throw new Error(`Invalid coordinates for dropoff point`)
  }

  // Build waypoints (all pickups except the first, which is the origin)
  const waypointPoints = pickups.slice(1)
  if (waypointPoints.length === 0) {
    // Only one pickup, use single pickup route
    return await calculateSinglePickupRoute(pickups[0], dropoff, apiKey)
  }

  // Check if waypoints are too close together (less than 100m apart)
  // Google Maps API may return ZERO_RESULTS for very close waypoints
  const MIN_WAYPOINT_DISTANCE = 0.1 // 100 meters in km
  const filteredWaypoints: PickupPoint[] = []
  
  for (const waypoint of waypointPoints) {
    const distToOrigin = haversineKm(
      pickups[0].latitude, pickups[0].longitude,
      waypoint.latitude, waypoint.longitude
    )
    
    // Only add waypoint if it's far enough from origin
    if (distToOrigin >= MIN_WAYPOINT_DISTANCE) {
      filteredWaypoints.push(waypoint)
    } else {
      console.warn(`Waypoint ${waypoint.name} is too close to origin (${(distToOrigin * 1000).toFixed(0)}m), skipping`)
    }
  }

  // If all waypoints were filtered out, use single pickup route
  if (filteredWaypoints.length === 0) {
    console.warn('All waypoints too close to origin, using single pickup route')
    return await calculateSinglePickupRoute(pickups[0], dropoff, apiKey)
  }

  const waypoints = filteredWaypoints.map(
    p => `${p.latitude},${p.longitude}`
  ).join('|')

  const waypointParam = optimizeWaypoints ? `optimize:true|${waypoints}` : waypoints

  const params = new URLSearchParams({
    origin: `${pickups[0].latitude},${pickups[0].longitude}`,
    destination: `${dropoff.latitude},${dropoff.longitude}`,
    waypoints: waypointParam,
    key: apiKey,
    mode: 'driving',
    units: 'metric',
    alternatives: 'false',
  })

  const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`
  console.log('Google Maps API request:', {
    origin: `${pickups[0].latitude},${pickups[0].longitude}`,
    destination: `${dropoff.latitude},${dropoff.longitude}`,
    waypointCount: filteredWaypoints.length,
    totalPickups: pickups.length,
    filteredWaypoints: filteredWaypoints.map(w => ({ name: w.name, lat: w.latitude, lng: w.longitude }))
  })
  
  const response = await fetch(url)
  
  if (!response.ok) {
    console.error('Directions API HTTP error:', response.status, response.statusText)
    throw new Error('Directions API service unavailable')
  }
  
  const data = await response.json()
  console.log('Google Maps API response status:', data.status)
  if (data.error_message) {
    console.warn('API error message:', data.error_message)
  }

  // Handle various error statuses with fallback
  if (data.status === 'ZERO_RESULTS' || data.status === 'NOT_FOUND') {
    // Check if this is likely an international/impossible route
    const originToDestDistance = haversineKm(
      pickups[0].latitude, pickups[0].longitude,
      dropoff.latitude, dropoff.longitude
    )
    
    console.warn(`Directions API returned ${data.status}. Possible reasons:`)
    console.warn('- Waypoints too close together')
    console.warn('- Invalid coordinates')
    console.warn('- No driving route available (e.g., across oceans)')
    console.warn(`- Origin to destination distance: ${originToDestDistance.toFixed(2)}km`)
    
    if (originToDestDistance > 5000) {
      console.warn('⚠️ WARNING: Very long distance detected. This may be an international route that cannot be delivered by road.')
    }
    
    console.warn('Using fallback calculation (Haversine distance)')
    throw new Error(`ZERO_RESULTS`) // Trigger fallback
  }

  if (data.status !== 'OK' || !data.routes?.[0]) {
    console.warn(`Directions API returned ${data.status}, using fallback calculation`)
    if (data.error_message) {
      console.warn('API error message:', data.error_message)
    }
    throw new Error(`Directions API error: ${data.status}`)
  }

  const route = data.routes[0]
  const waypointOrder = route.waypoint_order || []

  // Reorder pickups based on optimized waypoint order (fixed-order mode: preserve input sequence)
  const orderedPickups: PickupPoint[] = optimizeWaypoints
    ? [
        pickups[0],
        ...waypointOrder.map((index: number) => pickups[index + 1]),
      ]
    : [...pickups]

  // Build segments from route legs
  const segments: RouteSegment[] = []
  let totalDistance = 0
  let totalDuration = 0

  route.legs.forEach((leg: any, index: number) => {
    // Determine 'from' point: first leg starts at origin, others start at previous waypoint
    const from = index === 0 
      ? orderedPickups[0] 
      : orderedPickups[index] // Current waypoint in ordered list
    // Determine 'to' point: last leg goes to dropoff, others go to next waypoint
    const to = index === route.legs.length - 1 
      ? dropoff 
      : orderedPickups[index + 1] // Next waypoint in ordered list

    const segment: RouteSegment = {
      from,
      to,
      distance: leg.distance.value / 1000,
      duration: leg.duration.value,
    }

    segments.push(segment)
    totalDistance += leg.distance.value / 1000
    totalDuration += leg.duration.value
  })

  return {
    pickupPoints: orderedPickups,
    dropoffPoint: dropoff,
    segments,
    totalDistance,
    totalDuration,
    estimatedDeliveryTime: Math.ceil(totalDuration / 60),
    routePolyline: route.overview_polyline?.points,
    waypointOrder: [0, ...waypointOrder.map((i: number) => i + 1)], // Include origin in order
  }
}

/**
 * Calculate delivery fee based on route and ride type pricing
 */
export function calculateDeliveryFee(
  route: OptimizedRoute,
  rideType: {
    basePrice?: number
    pricePerKm?: number
    pricePerMinute?: number
  }
): DeliveryFeeCalculation {
  const basePrice = rideType.basePrice ?? 0
  const pricePerKm = rideType.pricePerKm ?? 0
  const pricePerMinute = rideType.pricePerMinute ?? 0

  const distanceFee = pricePerKm * route.totalDistance
  const timeFee = pricePerMinute * (route.totalDuration / 60) // Convert seconds to minutes
  const totalFee = basePrice + distanceFee + timeFee

  return {
    basePrice,
    pricePerKm,
    pricePerMinute,
    distanceFee: Math.round(distanceFee * 100) / 100,
    timeFee: Math.round(timeFee * 100) / 100,
    totalFee: Math.round(totalFee * 100) / 100,
  }
}

/**
 * Main function to calculate route and delivery fee
 */
export async function calculateRouteAndFee(
  pickupPoints: PickupPoint[],
  dropoffPoint: DropoffPoint,
  rideType: {
    basePrice?: number
    pricePerKm?: number
    pricePerMinute?: number
  },
  apiKey: string,
  routeOptions?: OptimizedRouteOptions
): Promise<RouteCalculationResult> {
  try {
    if (pickupPoints.length === 0) {
      return {
        route: {} as OptimizedRoute,
        deliveryFee: {} as DeliveryFeeCalculation,
        isValid: false,
        error: 'At least one pickup point is required',
      }
    }

    const route = await calculateOptimizedRoute(pickupPoints, dropoffPoint, apiKey, routeOptions)
    
    if (!route) {
      return {
        route: {} as OptimizedRoute,
        deliveryFee: {} as DeliveryFeeCalculation,
        isValid: false,
        error: 'Failed to calculate route',
      }
    }

    const deliveryFee = calculateDeliveryFee(route, rideType)

    return {
      route,
      deliveryFee,
      isValid: true,
    }
  } catch (error) {
    console.error('Route and fee calculation error:', error)
    return {
      route: {} as OptimizedRoute,
      deliveryFee: {} as DeliveryFeeCalculation,
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Fallback: Calculate simple distance-based route when API is unavailable
 * Uses Haversine formula for straight-line distance (less accurate but no API needed)
 */
export function calculateFallbackRoute(
  pickupPoints: PickupPoint[],
  dropoffPoint: DropoffPoint
): OptimizedRoute {
  // Use the shared haversineKm function (defined above)

  // For fallback, use nearest neighbor algorithm to optimize order
  // Start from first pickup, then find nearest unvisited pickup, finally go to dropoff
  const orderedPickups: PickupPoint[] = []
  const remaining = [...pickupPoints]
  
  // Start with first pickup
  if (remaining.length > 0) {
    orderedPickups.push(remaining.shift()!)
  }
  
  // Nearest neighbor: always go to the closest unvisited pickup
  while (remaining.length > 0) {
    const current = orderedPickups[orderedPickups.length - 1]
    let nearestIndex = 0
    let nearestDistance = haversineKm(
      current.latitude, current.longitude,
      remaining[0].latitude, remaining[0].longitude
    )
    
    for (let i = 1; i < remaining.length; i++) {
      const dist = haversineKm(
        current.latitude, current.longitude,
        remaining[i].latitude, remaining[i].longitude
      )
      if (dist < nearestDistance) {
        nearestDistance = dist
        nearestIndex = i
      }
    }
    
    orderedPickups.push(remaining.splice(nearestIndex, 1)[0])
  }

  const segments: RouteSegment[] = []
  let totalDistance = 0
  let totalDuration = 0

  // Calculate segments: pickup to pickup, then last pickup to dropoff
  // Segment 1: First pickup to second pickup (if multiple pickups)
  for (let i = 0; i < orderedPickups.length - 1; i++) {
    const from = orderedPickups[i]
    const to = orderedPickups[i + 1]
    
    const distance = haversineKm(from.latitude, from.longitude, to.latitude, to.longitude)
    // Estimate duration: assume average speed of 30 km/h in city
    const duration = (distance / 30) * 3600 // Convert to seconds
    
    segments.push({ from, to, distance, duration })
    totalDistance += distance
    totalDuration += duration
  }
  
  // Final segment: Last pickup to dropoff
  if (orderedPickups.length > 0) {
    const from = orderedPickups[orderedPickups.length - 1]
    const to = dropoffPoint
    
    const distance = haversineKm(from.latitude, from.longitude, to.latitude, to.longitude)
    
    // Smart speed estimation based on distance
    // For very long distances (likely international/cross-ocean), this is unrealistic for delivery
    // But we'll estimate conservatively
    let avgSpeed: number
    if (distance > 5000) {
      // Cross-continental: unrealistic for delivery, but estimate anyway
      avgSpeed = 800 // Air freight speed (very rough estimate)
      console.warn(`⚠️ Very long distance detected (${distance.toFixed(0)}km). This may be an international route that cannot be delivered by road.`)
    } else if (distance > 1000) {
      // Long distance: highway speed
      avgSpeed = 80 // Highway speed
    } else if (distance > 100) {
      // Medium distance: mixed city/highway
      avgSpeed = 50
    } else {
      // Short distance: city speed
      avgSpeed = 30
    }
    
    const duration = (distance / avgSpeed) * 3600 // Convert to seconds
    
    segments.push({ from, to, distance, duration })
    totalDistance += distance
    totalDuration += duration
  }

  return {
    pickupPoints: orderedPickups,
    dropoffPoint,
    segments,
    totalDistance,
    totalDuration,
    estimatedDeliveryTime: Math.ceil(totalDuration / 60),
  }
}
