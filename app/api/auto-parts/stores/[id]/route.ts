import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const userLat = parseFloat(searchParams.get('latitude') || '0')
    const userLon = parseFloat(searchParams.get('longitude') || '0')
    const categoryId = searchParams.get('categoryId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const store = await prisma.user.findUnique({
      where: { id: params.id, role: 'VENDOR' },
      include: {
        vendorProfile: {
          select: {
            businessName: true,
            businessType: true,
            description: true,
            address: true,
            city: true,
            state: true,
            latitude: true,
            longitude: true,
            logo: true,
            coverImage: true,
            website: true,
          },
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
      }
    })

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    // Get store products
    const productWhere: any = {
      vendorId: params.id,
      type: 'AUTO_PART',
      isActive: true,
      stockQuantity: { gt: 0 }
    }

    if (categoryId) {
      productWhere.categoryId = categoryId
    }

    const [products, totalProducts] = await Promise.all([
      prisma.product.findMany({
        where: productWhere,
        include: {
          category: {
            select: {
              name: true,
            }
          },
          reviews: {
            select: {
              rating: true,
            }
          }
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.product.count({ where: productWhere })
    ])

    const profile = store.vendorProfile
    const storeReviews = await prisma.review.aggregate({
      where: {
        targetType: "VENDOR",
        targetId: store.id,
      },
      _avg: { rating: true },
      _count: { _all: true },
    })
    let distance = null
    if (userLat && userLon && profile?.latitude && profile?.longitude) {
      distance = calculateDistance(userLat, userLon, profile.latitude, profile.longitude)
    }

    const formattedProducts = products.map(product => {
      const avgRating = product.reviews.length > 0
        ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length
        : 4.5

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        compareAtPrice: product.comparePrice,
        images: product.images,
        stock: product.stockQuantity,
        rating: avgRating,
        reviews: product.reviews.length,
        category: product.category?.name || '',
        brand: product.brand || '',
        sku: product.sku || '',
      }
    })

    return NextResponse.json({
      store: {
        id: store.id,
        name: profile?.businessName || store.name || 'Auto Parts Store',
        description: profile?.description || '',
        address: profile?.address || '',
        city: profile?.city || '',
        state: profile?.state || '',
        phone: store.phone || '',
        email: store.email || '',
        website: profile?.website || '',
        logo: profile?.logo || null,
        coverImage: profile?.coverImage || null,
        isVerified: store.isVerified || false,
        rating: Number(storeReviews._avg.rating || 0),
        totalReviews: Number(storeReviews._count._all || 0),
        distance: distance ? `${distance.toFixed(1)} km` : null,
        distanceValue: distance,
        partsCount: store._count.vendorProducts,
        latitude: profile?.latitude,
        longitude: profile?.longitude,
      },
      products: formattedProducts,
      pagination: {
        page,
        limit,
        total: totalProducts,
        totalPages: Math.ceil(totalProducts / limit)
      }
    })
  } catch (error) {
    console.error("Store details fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch store details" }, { status: 500 })
  }
}

