import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const MIN_NEARBY_KM = 0
const MAX_NEARBY_KM = 70

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const hasLat = searchParams.get("latitude") != null
    const hasLon = searchParams.get("longitude") != null
    const userLat = hasLat ? parseFloat(searchParams.get("latitude") as string) : null
    const userLon = hasLon ? parseFloat(searchParams.get("longitude") as string) : null
    const hasCoords = Number.isFinite(userLat) && Number.isFinite(userLon)
    const city = searchParams.get('city') // City filter
    const limit = parseInt(searchParams.get('limit') || '5')

    // Build where clause for products with discounts
    const productWhere: any = {
      type: 'AUTO_PART',
      isActive: true,
      stockQuantity: { gt: 0 },
      comparePrice: { not: null },
    }

    // Filter by vendor city if provided
    if (city && !hasCoords) {
      productWhere.vendor = {
        vendorProfile: {
          city: {
            contains: city,
            mode: 'insensitive'
          }
        }
      }
    }

    // Get products with discounts (comparePrice > price)
    const deals = await prisma.product.findMany({
      where: {
        ...productWhere,
        price: { lt: prisma.product.fields.comparePrice }
      },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            vendorProfile: {
              select: {
                businessName: true,
                logo: true,
                city: true,
                state: true,
                latitude: true,
                longitude: true,
              }
            }
          }
        },
        reviews: {
          select: {
            rating: true,
          }
        }
      },
      orderBy: [
        // Sort by discount percentage (highest first)
        { createdAt: 'desc' }
      ],
      take: limit,
    })

    const dealsWithDiscount = deals.map(part => {
      const discount = part.comparePrice && part.price
        ? Math.round(((part.comparePrice - part.price) / part.comparePrice) * 100)
        : 0

      const avgRating = part.reviews.length > 0
        ? part.reviews.reduce((sum, r) => sum + r.rating, 0) / part.reviews.length
        : 4.5

      const vendorProfile = part.vendor.vendorProfile
      const distance =
        hasCoords && vendorProfile?.latitude && vendorProfile?.longitude
          ? calculateDistance(userLat as number, userLon as number, vendorProfile.latitude, vendorProfile.longitude)
          : null

      return {
        id: part.id,
        name: part.name,
        description: part.description,
        partNumber: part.sku,
        brand: part.brand || '',
        model: '',
        year: '',
        partType: '',
        category: part.category?.name || '',
        condition: '',
        price: part.price,
        compareAtPrice: part.comparePrice,
        discount: discount,
        stock: part.stockQuantity,
        images: part.images,
        warranty: '',
        rating: avgRating,
        reviews: part.reviews.length,
        store: {
          id: part.vendor.id,
          name: vendorProfile?.businessName || part.vendor.name || '',
          logo: vendorProfile?.logo || part.vendor.avatar,
          rating: 4.5,
          isVerified: part.vendor.isVerified || false,
          city: vendorProfile?.city || "",
          distance: distance ? `${distance.toFixed(1)} km` : null,
          distanceValue: distance,
        }
      }
    })

    // Sort by discount percentage
    dealsWithDiscount.sort((a, b) => {
      const aInPreferredBand =
        typeof a.store?.distanceValue === "number" && a.store.distanceValue >= 15 && a.store.distanceValue <= 70
      const bInPreferredBand =
        typeof b.store?.distanceValue === "number" && b.store.distanceValue >= 15 && b.store.distanceValue <= 70
      if (aInPreferredBand !== bInPreferredBand) return aInPreferredBand ? -1 : 1
      const ad = typeof a.store?.distanceValue === "number" ? a.store.distanceValue : Number.MAX_SAFE_INTEGER
      const bd = typeof b.store?.distanceValue === "number" ? b.store.distanceValue : Number.MAX_SAFE_INTEGER
      if (ad !== bd) return ad - bd
      return b.discount - a.discount
    })

    const filteredDeals = dealsWithDiscount
      .filter((p) => {
        const dv = (p as any)?.store?.distanceValue
        if (dv == null) return true
        return dv >= MIN_NEARBY_KM && dv <= MAX_NEARBY_KM
      })
      .slice(0, limit)

    return NextResponse.json({
      deals: filteredDeals,
    })
  } catch (error) {
    console.error("Deals fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 })
  }
}

