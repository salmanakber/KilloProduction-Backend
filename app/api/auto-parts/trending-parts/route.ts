import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const MIN_NEARBY_KM = 0
const MAX_NEARBY_KM = 70

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
    const hasLat = searchParams.get("latitude") != null
    const hasLon = searchParams.get("longitude") != null
    const userLat = hasLat ? parseFloat(searchParams.get("latitude") as string) : null
    const userLon = hasLon ? parseFloat(searchParams.get("longitude") as string) : null
    const hasCoords = Number.isFinite(userLat) && Number.isFinite(userLon)
    const city = searchParams.get('city') // City filter
    const limit = parseInt(searchParams.get('limit') || '10')

    // Get date ranges
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const twoDaysAgo = new Date(today)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

    // Build where clause for products
    const productWhere: any = {
      type: 'AUTO_PART',
      isActive: true,
      stockQuantity: { gt: 0 }
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

    // Get all active products (from Product model)
    const allParts = await prisma.product.findMany({
      where: productWhere,
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
                address: true,
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
        },
        _count: {
          select: {
            reviews: true,
          }
        }
      }
    })

    // Get today's sales
    const todaySales = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        productId: { in: allParts.map(p => p.id) },
        order: {
          module: 'AUTO_PARTS',
          status: { in: ['DELIVERED', 'CONFIRMED'] },
          createdAt: { gte: today }
        }
      },
      _sum: {
        quantity: true
      }
    })

    // Get yesterday's sales
    const yesterdaySales = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        productId: { in: allParts.map(p => p.id) },
        order: {
          module: 'AUTO_PARTS',
          status: { in: ['DELIVERED', 'CONFIRMED'] },
          createdAt: { gte: yesterday, lt: today }
        }
      },
      _sum: {
        quantity: true
      }
    })

    // Calculate growth
    const salesMap = new Map()
    
    todaySales.forEach(sale => {
      salesMap.set(sale.productId, {
        today: sale._sum.quantity || 0,
        yesterday: 0,
        growth: 0
      })
    })

    yesterdaySales.forEach(sale => {
      const existing = salesMap.get(sale.productId) || { today: 0, yesterday: 0, growth: 0 }
      existing.yesterday = sale._sum.quantity || 0
      salesMap.set(sale.productId, existing)
    })

    // Calculate growth percentage
    salesMap.forEach((value, key) => {
      if (value.yesterday === 0 && value.today > 0) {
        value.growth = 100 // New part sold today
      } else if (value.yesterday > 0) {
        value.growth = ((value.today - value.yesterday) / value.yesterday) * 100
      }
    })

    // Sort by growth and get top parts
    const sortedParts = Array.from(salesMap.entries())
      .filter(([_, data]) => data.growth > 0)
      .sort((a, b) => b[1].growth - a[1].growth)
      .slice(0, limit)

    // Get part details
    const trendingPartIds = sortedParts.map(([id, _]) => id)
    
    const trendingParts = await Promise.all(
      trendingPartIds.map(async (partId) => {
        const part = allParts.find(p => p.id === partId)
        if (!part) return null

        const salesData = salesMap.get(partId)
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
          stock: part.stockQuantity,
          images: part.images,
          warranty: '',
          rating: avgRating,
          reviews: part._count.reviews,
          totalSold: salesData?.today || 0,
          growth: salesData?.growth || 0,
          store: {
            id: part.vendor.id,
            name: vendorProfile?.businessName || part.vendor.name || '',
            logo: vendorProfile?.logo || part.vendor.avatar,
            rating: 4.5,
            isVerified: part.vendor.isVerified || false,
            address: vendorProfile?.address || '',
            city: vendorProfile?.city || "",
            distance: distance ? `${distance.toFixed(1)} km` : null,
            distanceValue: distance,
          }
        }
      })
    )

    const validTrendingParts = trendingParts
      .filter((p) => p !== null)
      .filter((p: any) => {
        const dv = p?.store?.distanceValue
        if (dv == null) return true
        return dv >= MIN_NEARBY_KM && dv <= MAX_NEARBY_KM
      })
      .sort((a: any, b: any) => {
        const aInPreferredBand =
          typeof a?.store?.distanceValue === "number" && a.store.distanceValue >= 15 && a.store.distanceValue <= 70
        const bInPreferredBand =
          typeof b?.store?.distanceValue === "number" && b.store.distanceValue >= 15 && b.store.distanceValue <= 70
        if (aInPreferredBand !== bInPreferredBand) return aInPreferredBand ? -1 : 1
        const ad = typeof a?.store?.distanceValue === "number" ? a.store.distanceValue : Number.MAX_SAFE_INTEGER
        const bd = typeof b?.store?.distanceValue === "number" ? b.store.distanceValue : Number.MAX_SAFE_INTEGER
        if (ad !== bd) return ad - bd
        return (b?.growth || 0) - (a?.growth || 0)
      })
      .slice(0, limit)

    // If no trending parts found, show featured parts
    if (validTrendingParts.length === 0) {
      const featuredParts = await prisma.autoPart.findMany({
        where: {
          isActive: true,
          isFeatured: true,
          stock: { gt: 0 }
        },
        include: {
          store: {
            select: {
              id: true,
              storeName: true,
              logo: true,
              rating: true,
              isVerified: true,
              address: true,
            }
          },
          reviews: {
            select: {
              rating: true,
            }
          }
        },
        take: limit,
        orderBy: { createdAt: 'desc' }
      })

      return NextResponse.json({
        parts: featuredParts.map(part => {
          const avgRating = part.reviews.length > 0
            ? part.reviews.reduce((sum, r) => sum + r.rating, 0) / part.reviews.length
            : 4.5

          return {
            id: part.id,
            name: part.name,
            description: part.description,
            partNumber: part.partNumber,
            brand: part.brand,
            model: part.model,
            year: part.year,
            partType: part.partType,
            category: part.category,
            condition: part.condition,
            price: part.price,
            compareAtPrice: part.compareAtPrice,
            stock: part.stock,
            images: part.images,
            warranty: part.warranty,
            rating: avgRating,
            reviews: part.reviews.length,
            totalSold: 0,
            growth: 0,
            store: {
              id: part.store.id,
              name: part.store.storeName,
              logo: part.store.logo,
              rating: part.store.rating,
              isVerified: part.store.isVerified,
              address: part.store.address,
            }
          }
        })
      })
    }

    return NextResponse.json({
      parts: validTrendingParts,
    })
  } catch (error) {
    console.error("Trending parts fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch trending parts" }, { status: 500 })
  }
}

