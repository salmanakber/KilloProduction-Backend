import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userLat = parseFloat(searchParams.get('latitude') || '0')
    const userLon = parseFloat(searchParams.get('longitude') || '0')
    const city = searchParams.get('city')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    // Build where clause
    const vendorWhere: any = {
      role: 'VENDOR',
      vendorProfile: { isNot: null },
      vendorProducts: {
        some: {
          type: 'AUTO_PART',
          isActive: true,
          stockQuantity: { gt: 0 }
        }
      }
    }

    // Filter by city if provided
    if (city) {
      vendorWhere.vendorProfile = {
        is: {
          city: {
            contains: city,
            mode: 'insensitive'
          }
        }
      }
    }

    // Search filter
    if (search) {
      vendorWhere.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { vendorProfile: { is: { businessName: { contains: search, mode: 'insensitive' } } } }
      ]
    }

    // Get stores
    const [stores, total] = await Promise.all([
      prisma.user.findMany({
        where: vendorWhere,
        include: {
          vendorProfile: {
            select: {
              businessName: true,
              city: true,
              state: true,
              address: true,
              latitude: true,
              longitude: true,
              logo: true,
              coverImage: true,
              description: true,
            }
          },
          vendorProducts: {
            where: {
              type: 'AUTO_PART',
              isActive: true,
              stockQuantity: { gt: 0 }
            },
            select: {
              id: true,
              name: true,
              price: true,
              images: true,
            },
            take: 5,
          },
          _count: {
            select: {
              vendorProducts: {
                where: {
                  type: 'AUTO_PART',
                  isActive: true,
                  stockQuantity: { gt: 0 }
                }
              }
            }
          }
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where: vendorWhere })
    ])

    // Format stores with distance
    const formattedStores = stores.map(store => {
      const profile = store.vendorProfile
      let distance = null
      if (userLat && userLon && profile?.latitude && profile?.longitude) {
        distance = calculateDistance(userLat, userLon, profile.latitude, profile.longitude)
      }

      const images = store.vendorProducts[0]?.images
      const imageArray = images ? (Array.isArray(images) ? images : [images]) : []

      return {
        id: store.id,
        name: profile?.businessName || store.name || 'Auto Parts Store',
        description: profile?.description || '',
        address: profile?.address || '',
        city: profile?.city || '',
        state: profile?.state || '',
        phone: store.phone || '',
        email: store.email || '',
        logo: profile?.logo || store.avatar,
        coverImage: profile?.coverImage || imageArray[0] || null,
        rating: 4.5, // Can be calculated from reviews
        totalReviews: 0,
        isVerified: store.isVerified || false,
        distance: distance ? `${distance.toFixed(1)} km` : null,
        distanceValue: distance,
        partsCount: store._count.vendorProducts,
        featuredParts: store.vendorProducts.slice(0, 3),
        latitude: profile?.latitude,
        longitude: profile?.longitude,
      }
    })

    // Sort by distance if coordinates available
    if (userLat && userLon) {
      formattedStores.sort((a, b) => {
        if (a.distanceValue === null) return 1
        if (b.distanceValue === null) return -1
        return a.distanceValue - b.distanceValue
      })
    }

    return NextResponse.json({
      stores: formattedStores,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error("Stores fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch stores" }, { status: 500 })
  }
}
