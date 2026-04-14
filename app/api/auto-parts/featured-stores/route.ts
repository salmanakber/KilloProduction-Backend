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
  const distance = R * c
  return distance
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userLat = parseFloat(searchParams.get('latitude') || '0')
    const userLon = parseFloat(searchParams.get('longitude') || '0')
    const city = searchParams.get('city') // City filter
    const limit = parseInt(searchParams.get('limit') || '10')
 

    // Build where clause for vendors with products
    const vendorWhere: any = {
      role: 'VENDOR',
      vendorProducts: {
        some: {
          type: 'AUTO_PART',
          isActive: true,
          stockQuantity: { gt: 0 }
        }
      }
    }

    // Filter by city if provided - use 'is' instead of 'isNot' when adding conditions
    if (city) {
      vendorWhere.vendorProfile = {
        is: {
          city: {
            contains: city,
            mode: 'insensitive'
          }
        }
      }
    } else {
      vendorWhere.vendorProfile = { isNot: null }
    }

    // Get vendors with auto parts products
    const vendors = await prisma.user.findMany({
      where: vendorWhere,
      include: {
        vendorProfile: {
          select: {
            businessName: true,
            city: true,
            state: true,
            address: true,
            logo: true,
            longitude: true,
            latitude: true,
            description: true,
            coverImage: true,
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
            isFeatured: true,
          },
          take: 5,
        },
        receivedReviews: {
          where: {
            targetType: 'VENDOR'
          },
          select: {
            rating: true,
          }
        },
        _count: {
          select: {
            vendorProducts: {
              where: {
                type: 'AUTO_PART',
                isActive: true,
                stockQuantity: { gt: 0 }
              }
            },
            receivedReviews: {
              where: {
                targetType: 'VENDOR'
              }
            }
          }
        }
      },
      take: limit,
    })

    // Format as stores
    const stores = vendors.map(vendor => {
      const images = vendor.vendorProducts[0]?.images
      const imageArray = images ? (Array.isArray(images) ? images : [images]) : []

      // Calculate rating from reviews
      const reviews = vendor.receivedReviews || []
      const totalReviews = vendor._count.receivedReviews || 0
      const averageRating = reviews.length > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
        : 0
      const rating = totalReviews > 0 ? parseFloat(averageRating.toFixed(1)) : 0

      // Calculate distance
      const distance = vendor.vendorProfile?.latitude && vendor.vendorProfile?.longitude
        ? calculateDistance(userLat, userLon, vendor.vendorProfile.latitude, vendor.vendorProfile.longitude)
        : null

      return {
        id: vendor.id,
        storeName: vendor.vendorProfile?.businessName || vendor.name || 'Auto Parts Store',
        description: vendor.vendorProfile?.description || '',
        address: vendor.vendorProfile?.address || '',
        phone: vendor.phone || '',
        email: vendor.email || '',
        logo: vendor.vendorProfile?.logo || vendor.avatar,
        coverImage: vendor.vendorProfile?.coverImage || imageArray[0] || null,
        rating,
        totalReviews,
        totalOrders: 0, // Can be calculated from orders if needed
        isVerified: vendor.isVerified || false,
        distance: distance ? `${distance.toFixed(1)} km` : null,
        distanceValue: distance,
        partsCount: vendor._count.vendorProducts,
        featuredParts: vendor.vendorProducts.filter(p => p.isFeatured).slice(0, 3).map(p => ({
          id: p.id,
          name: p.name,
          price: p.price,
          images: p.images,
          isFeatured: p.isFeatured,
        })),
        user: {
          name: vendor.name,
          phone: vendor.phone,
          isVerified: vendor.isVerified
        }
      }
    })

    return NextResponse.json({
      stores,
    })
  } catch (error) {
    console.error("Featured stores fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch featured stores" }, { status: 500 })
  }
}

