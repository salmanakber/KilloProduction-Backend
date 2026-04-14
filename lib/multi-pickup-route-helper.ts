/**
 * Multi-Pickup Route Helper
 * 
 * Helper functions for saving and retrieving route data from database
 */

import { prisma } from '@/lib/prisma'
import type { OptimizedRoute, PickupPoint } from './multi-pickup-route.service'

export interface RouteData {
  orderId: string
  totalDistance: number
  totalDuration: number
  estimatedDeliveryTime: number
  routePolyline?: string
  waypointOrder?: number[]
  segments: Array<{
    fromId: string
    toId: string
    distance: number
    duration: number
    polyline?: string
  }>
}

/**
 * Save optimized route data to MultiplePickup records
 */
export async function saveRouteToMultiplePickups(
  orderId: string,
  route: OptimizedRoute,
  module: 'GROCERY' | 'FOOD' | 'PHARMACY' | 'AUTO_PARTS'
): Promise<void> {
  try {
    // Create MultiplePickup records for each pickup point in optimized order
    const pickupRecords = await Promise.all(
      route.pickupPoints.map(async (pickup, index) => {
        // Determine store type and ID
        let restaurantId: string | undefined
        let groceryStoreId: string | undefined
        let pharmacyId: string | undefined
        // Note: AUTO_PARTS support - store info is denormalized in storeName/storeAddress fields
        // If you need a foreign key relation, add autoPartsStoreId to the schema

        if (module === 'FOOD') {
          restaurantId = pickup.id
        } else if (module === 'GROCERY') {
          groceryStoreId = pickup.id
        } else if (module === 'PHARMACY') {
          pharmacyId = pickup.id
        }
        // AUTO_PARTS: Store info is saved in denormalized fields (storeName, storeAddress, etc.)

        // Get segment data for this pickup
        const segment = route.segments[index]
        const distanceFromPrevious = segment?.distance ?? 0
        const durationFromPrevious = segment?.duration ?? 0

        return prisma.multiplePickup.create({
          data: {
            orderId,
            restaurantId,
            groceryStoreId,
            pharmacyId,
            storeName: pickup.name,
            storeAddress: pickup.address,
            storeLatitude: pickup.latitude,
            storeLongitude: pickup.longitude,
            module,
            sequence: index + 1,
            distanceFromPrevious,
            durationFromPrevious,
            totalRouteDistance: route.totalDistance,
            totalRouteDuration: route.totalDuration,
            routePolyline: segment?.polyline,
            status: 'PENDING',
          },
        })
      })
    )

    // Update order with route metadata
    await prisma.order.update({
      where: { id: orderId },
      data: {
        // Store route summary in notes or create a separate route data field
        // For now, we'll store it in a JSON field if available, or in notes
        notes: JSON.stringify({
          routeDistance: route.totalDistance,
          routeDuration: route.totalDuration,
          estimatedDeliveryTime: route.estimatedDeliveryTime,
          routePolyline: route.routePolyline,
          waypointOrder: route.waypointOrder,
        }),
      },
    })

    return
  } catch (error) {
    console.error('Error saving route to multiple pickups:', error)
    throw error
  }
}

/**
 * Get route data for an order
 */
export async function getRouteDataForOrder(orderId: string): Promise<RouteData | null> {
  try {
    const pickups = await prisma.multiplePickup.findMany({
      where: { orderId },
      orderBy: { sequence: 'asc' },
    })

    if (pickups.length === 0) {
      return null
    }

    const firstPickup = pickups[0]
    const routeData: RouteData = {
      orderId,
      totalDistance: firstPickup.totalRouteDistance ?? 0,
      totalDuration: firstPickup.totalRouteDuration ?? 0,
      estimatedDeliveryTime: firstPickup.totalRouteDuration
        ? Math.ceil(firstPickup.totalRouteDuration / 60)
        : 0,
      routePolyline: firstPickup.routePolyline ?? undefined,
      segments: pickups.map((p, index) => ({
        fromId: p.id,
        toId: index === pickups.length - 1 ? 'dropoff' : pickups[index + 1].id,
        distance: p.distanceFromPrevious ?? 0,
        duration: p.durationFromPrevious ?? 0,
        polyline: p.routePolyline ?? undefined,
      })),
    }

    return routeData
  } catch (error) {
    console.error('Error getting route data:', error)
    return null
  }
}

/**
 * Get pickup points for an order (for rider navigation)
 */
export async function getPickupPointsForOrder(orderId: string) {
  try {
    const pickups = await prisma.multiplePickup.findMany({
      where: { orderId },
      orderBy: { sequence: 'asc' },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        groceryStore: {
          select: {
            id: true,
            storeName: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
      },
    })

    return pickups.map((p) => ({
      id: p.id,
      sequence: p.sequence,
      storeName: p.storeName,
      address: p.storeAddress,
      latitude: p.storeLatitude,
      longitude: p.storeLongitude,
      status: p.status,
      pickedUpAt: p.pickedUpAt,
      distanceFromPrevious: p.distanceFromPrevious,
      durationFromPrevious: p.durationFromPrevious,
      restaurant: p.restaurant,
      groceryStore: p.groceryStore,
    }))
  } catch (error) {
    console.error('Error getting pickup points:', error)
    return []
  }
}
