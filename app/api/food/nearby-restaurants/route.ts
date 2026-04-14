import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { effectiveRestaurantOpenNow } from '@/lib/openingHours'

// Haversine formula to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c
  return distance
}

// Check if restaurant is currently open based on openingHours JSON
function isRestaurantOpen(openingHours: any, isOpenFlag: boolean): boolean {
  if (!isOpenFlag) return false
  if (!openingHours || typeof openingHours !== 'object') return isOpenFlag

  const now = new Date()
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const currentDay = dayNames[now.getDay()]
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const todayHours = openingHours[currentDay]
  if (!todayHours || !todayHours.open || !todayHours.close) return isOpenFlag

  return currentTime >= todayHours.open && currentTime <= todayHours.close
}

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userLat = parseFloat(searchParams.get('latitude') || '0')
    const userLon = parseFloat(searchParams.get('longitude') || '0')
    const maxDistance = parseFloat(searchParams.get('maxDistance') || '50') // km
    const limit = parseInt(searchParams.get('limit') || '20')
    const isOpen = searchParams.get('isOpen') // Optional filter for open restaurants only

    if (!userLat || !userLon) {
      return NextResponse.json({ 
        error: 'Location required',
        message: 'Please provide latitude and longitude'
      }, { status: 400 })
    }

    // Get all restaurants with their vendor profile locations
    const restaurants = await prisma.restaurant.findMany({
      where: {
        // Add any additional filters here
      },
      include: {
        user: {
          include: {
            vendorProfile: {
              select: {
                latitude: true,
                longitude: true,
                city: true,
                state: true,
              }
            }
          }
        },
        menuItems: {
          where: { isAvailable: true },
          select: {
            id: true,
            name: true,
            price: true,
            images: true,
            isFeatured: true,
          },
          take: 5,
        },
        restaurantOffers: {
          where: {
            isActive: true,
            startsAt: { lte: new Date() },
            expiresAt: { gte: new Date() },
          },
          select: {
            id: true,
            title: true,
            discountType: true,
            discountValue: true,
          },
          take: 1,
        },
        _count: {
          select: {
            menuItems: {
              where: { isAvailable: true },
            },
          },
        },
      },
    })

    // Calculate distance and filter restaurants
    const restaurantsWithDistance = restaurants
      .map(restaurant => {
        // Use Restaurant's latitude/longitude first, fallback to vendorProfile
        const lat = restaurant.latitude || restaurant.user?.vendorProfile?.latitude
        const lon = restaurant.longitude || restaurant.user?.vendorProfile?.longitude
        
        // Skip if no location data available
        if (!lat || !lon) {
          return null
        }

        const restaurantLat = Number(lat)
        const restaurantLon = Number(lon)
        
        const distance = calculateDistance(
          userLat,
          userLon,
          restaurantLat,
          restaurantLon
        )
      
        if (distance > maxDistance) return null

        // Determine if open based on actual opening hours
        const isOpenNow = effectiveRestaurantOpenNow(restaurant.openingHours, restaurant.isOpen)

        // Filter by isOpen parameter if provided
        if (isOpen === 'true' && !isOpenNow) return null

        // Estimate delivery time based on distance
        let deliveryTime = '30-45 min'
        if (distance < 2) {
          deliveryTime = '15-30 min'
        } else if (distance < 5) {
          deliveryTime = '20-35 min'
        } else if (distance < 10) {
          deliveryTime = '30-45 min'
        } else {
          deliveryTime = '45-60 min'
        }

        return {
          id: restaurant.id,
          name: restaurant.name,
          description: restaurant.description,
          cuisine: restaurant.cuisine || [],
          address: restaurant.address,
          phone: restaurant.phone,
          email: restaurant.email,
          website: restaurant.website,
          logo: restaurant.logo,
          coverImage: restaurant.coverImage,
          images: restaurant.images,
          rating: restaurant.rating || 0,
          totalReviews: restaurant.totalReviews || 0,
          totalOrders: restaurant.totalOrders || 0,
          priceRange: restaurant.priceRange,
          deliveryTime,
          deliveryFee: restaurant.deliveryFee,
          minOrderAmount: restaurant.minOrderAmount,
          maxDeliveryDistance: restaurant.maxDeliveryDistance,
          isOpen: isOpenNow,
          isVerified: restaurant.isVerified,
          acceptsReservations: restaurant.acceptsReservations,
          hasTableService: restaurant.hasTableService,
          openingHours: restaurant.openingHours,
          deliveryZones: restaurant.deliveryZones,
          specialDiets: restaurant.specialDiets,
          features: restaurant.features,
          distance: parseFloat(distance.toFixed(2)),
          distanceDisplay: `${distance.toFixed(1)} km`,
          coordinates: {
            lat: restaurantLat,
            lon: restaurantLon
          },
          city: restaurant.user?.vendorProfile?.city || null,
          state: restaurant.user?.vendorProfile?.state || null,
          menuItems: restaurant.menuItems,
          activeOffer: restaurant.restaurantOffers[0] || null,
          menuItemsCount: restaurant._count.menuItems,
        }
      })
      .filter(r => r !== null)
      .sort((a, b) => {
        // Sort by distance first, then by rating
        if (a!.distance !== b!.distance) {
          return a!.distance - b!.distance
        }
        return b!.rating - a!.rating
      })
      .slice(0, limit)

    return NextResponse.json({ 
      restaurants: restaurantsWithDistance,
      total: restaurantsWithDistance.length,
      userLocation: {
        latitude: userLat,
        longitude: userLon
      }
    })
  } catch (error) {
    console.error('Error fetching nearby restaurants:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

