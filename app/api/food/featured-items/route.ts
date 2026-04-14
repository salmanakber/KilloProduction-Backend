import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

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

    if (!userLat || !userLon) {
      return NextResponse.json({ 
        error: 'Location required',
        message: 'Please provide latitude and longitude'
      }, { status: 400 })
    }

    // Get all featured items with restaurant details
    const items = await prisma.menuItem.findMany({
      where: {
        isFeatured: true,
        isAvailable: true,
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            isOpen: true,
            latitude: true,
            longitude: true,
            rating: true,
            totalReviews: true,
            deliveryFee: true,
            user: {
              include: {
                vendorProfile: {
                  select: {
                    latitude: true,
                    longitude: true,
                  }
                }
              }
            }
          },
        },
        _count: {
          select: {
            customizations: true,
          }
        }
      },
    })

    // Filter items by location and calculate distance, then sort by performance
    const itemsWithDistance = items
      .map(item => {
        const restaurant = item.restaurant
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
      
        // Filter by max distance
        if (distance > maxDistance) return null

        return {
          ...item,
          restaurant: {
            ...restaurant,
            distance: parseFloat(distance.toFixed(2)),
          },
          // Calculate performance score: rating (70%) + price competitiveness (30%)
          // Lower price = higher score, better rating = higher score
          performanceScore: 
            (restaurant.rating || 0) * 0.7 + 
            (restaurant.totalReviews || 0) * 0.01 +
            (item.price <= 10 ? 5 : item.price <= 20 ? 3 : item.price <= 30 ? 1 : 0) * 0.3
        }
      })
      .filter(item => item !== null)
      // Sort by: distance first, then performance score (reviews + price)
      .sort((a, b) => {
        // First sort by distance (nearest first)
        if (Math.abs(a!.restaurant.distance - b!.restaurant.distance) > 1) {
          return a!.restaurant.distance - b!.restaurant.distance
        }
        // Then by performance score (highest first)
        return b!.performanceScore - a!.performanceScore
      })
      .slice(0, limit)

    return NextResponse.json({ 
      items: itemsWithDistance.map(({ performanceScore, ...item }) => item) // Remove performanceScore from response
    })
  } catch (error) {
    console.error("Error fetching featured items:", error)
    return NextResponse.json({ error: "Failed to fetch featured items" }, { status: 500 })
  }
}
