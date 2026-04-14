import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

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
    const limit = parseInt(searchParams.get('limit') || '10')
    const restaurantId = searchParams.get('restaurantId') // Optional filter by restaurant
    const userLat = searchParams.get('latitude') ? parseFloat(searchParams.get('latitude')!) : null
    const userLon = searchParams.get('longitude') ? parseFloat(searchParams.get('longitude')!) : null
    const maxDistance = searchParams.get('maxDistance') ? parseFloat(searchParams.get('maxDistance')!) : null

    const now = new Date()

    const where: any = {
      isActive: true,
      startsAt: { lte: now },
      expiresAt: { gte: now },
      OR: [
        { approvalStatus: 'APPROVED' },
        { approvalStatus: null },
        { promoKind: 'REGULAR' },
      ],
    }

    if (restaurantId) {
      where.restaurantId = restaurantId
    }

    const offers = await prisma.restaurantOffer.findMany({
      where,
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            logo: true,
            coverImage: true,
            isOpen: true,
            isVerified: true,
            rating: true,
            totalReviews: true,
            latitude: true,
            longitude: true,
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
          }
        }
      },
      orderBy: [
        { discountValue: 'desc' }, // Sort by discount value
        { expiresAt: 'asc' }, // Then by expiration (ending soon first)
      ],
    })

    // Filter by location if provided
    let filteredOffers = offers
    if (userLat !== null && userLon !== null && maxDistance !== null) {
      filteredOffers = offers
        .map(offer => {
          const restaurant = offer.restaurant
          const lat = restaurant.latitude || restaurant.user?.vendorProfile?.latitude
          const lon = restaurant.longitude || restaurant.user?.vendorProfile?.longitude
          
          if (!lat || !lon) return null

          const distance = calculateDistance(userLat, userLon, Number(lat), Number(lon))
          if (distance > maxDistance) return null

          return {
            ...offer,
            restaurant: {
              ...restaurant,
              distance: parseFloat(distance.toFixed(2)),
            },
          }
        })
        .filter((offer): offer is NonNullable<typeof offer> => offer !== null)
    }

    // Limit results
    filteredOffers = filteredOffers.slice(0, limit)

    return NextResponse.json({ 
      offers: filteredOffers.map(offer => ({
        id: offer.id,
        restaurantId: offer.restaurantId,
        title: offer.title,
        description: offer.description,
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        minOrderAmount: offer.minOrderAmount,
        maxDiscount: offer.maxDiscount,
        itemName: offer.itemName,
        itemPrice: offer.itemPrice,
        images: offer.images,
        promoKind: (offer as any).promoKind ?? 'REGULAR',
        mysteryTeaser: (offer as any).mysteryTeaser ?? null,
        isActive: offer.isActive,
        startsAt: offer.startsAt,
        expiresAt: offer.expiresAt,
        restaurant: offer.restaurant,
      })),
      total: filteredOffers.length,
    })
  } catch (error) {
    console.error('Error fetching restaurant offers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}



