import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

async function calculateItemScore(
  item: any,
  store: any,
  distance: number,
  marketAveragePrice: number
): Promise<number> {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const isNewSeller = store.createdAt > ninetyDaysAgo

  // Get store performance metrics
  const [recentOrders, reviews, storeProducts] = await Promise.all([
    prisma.order.count({
      where: {
        groceryId: store.id,
        paymentStatus: 'PAID',
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.review.findMany({
      where: {
        groceryId: store.id,
      },
      select: {
        rating: true,
      },
    }),
    prisma.groceryProduct.findMany({
      where: {
        storeId: store.id,
        isActive: true,
        stock: { gt: 0 },
      },
      select: {
        price: true,
      },
    }),
  ])

  // Calculate scores
  const storeRating = store.rating || 0
  const reviewCount = reviews.length
  const positiveReviews = reviews.filter(r => (r.rating || 0) >= 4).length
  const averageStorePrice = storeProducts.length > 0
    ? storeProducts.reduce((sum, p) => sum + (p.price || 0), 0) / storeProducts.length
    : item.price

  // Item price competitiveness (compared to market average for similar items)
  const itemPrice = item.price || 0
  let priceScore = 50
  if (marketAveragePrice > 0) {
    const priceRatio = itemPrice / marketAveragePrice
    if (priceRatio <= 0.85) priceScore = 100 // 15%+ below market
    else if (priceRatio <= 0.95) priceScore = 90 // 5-15% below market
    else if (priceRatio <= 1.05) priceScore = 80 // At market average (±5%)
    else if (priceRatio <= 1.15) priceScore = 70 // 5-15% above market
    else priceScore = 50 // 15%+ above market
  }

  // Store performance score
  const salesScore = Math.min(100, recentOrders * 5)
  const reviewScore = Math.min(100, (storeRating * 15) + (positiveReviews * 2))
  const storePerformanceScore = (salesScore * 0.4) + (reviewScore * 0.6)

  // Item-specific factors
  const isFeatured = item.isFeatured ? 10 : 0
  const stockLevel = item.stock > 50 ? 10 : item.stock > 20 ? 7 : item.stock > 10 ? 5 : 0

  // Distance score (closer is better, but not the only factor)
  const distanceScore = distance < 2 ? 100 : distance < 5 ? 80 : distance < 10 ? 60 : 40

  // New seller boost
  const newSellerBoost = isNewSeller ? 15 : 0

  // Combined score:
  // - Store performance: 30%
  // - Price competitiveness: 25%
  // - Distance: 20%
  // - Item quality (featured, stock): 10%
  // - New seller boost: 15%
  const combinedScore =
    (storePerformanceScore * 0.3) +
    (priceScore * 0.25) +
    (distanceScore * 0.2) +
    ((isFeatured + stockLevel) * 0.1) +
    (newSellerBoost * 0.15)

  return combinedScore
}

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const userLat = parseFloat(searchParams.get('latitude') || '0')
    const userLon = parseFloat(searchParams.get('longitude') || '0')
    const maxDistance = parseFloat(searchParams.get('maxDistance') || '50')
    const limit = parseInt(searchParams.get('limit') || '20')

    if (!userLat || !userLon) {
      return NextResponse.json({ error: 'Location required', message: 'Please provide latitude and longitude' }, { status: 400 })
    }

    // Get all featured items with their stores
    const items = await prisma.groceryProduct.findMany({
      where: { 
        isFeatured: true, 
        isActive: true, 
        stock: { gt: 0 },
      },
      include: {
        store: {
          select: {
            id: true,
            storeName: true,
            isOpen: true,
            latitude: true,
            longitude: true,
            rating: true,
            totalReviews: true,
            deliveryFee: true,
            createdAt: true,
            isVerified: true,
          },
        },
      },
    })

    // Calculate market average price for featured items
    const allFeaturedPrices = items.map(i => i.price || 0).filter(p => p > 0)
    const marketAveragePrice = allFeaturedPrices.length > 0
      ? allFeaturedPrices.reduce((a, b) => a + b, 0) / allFeaturedPrices.length
      : 0

    // Calculate scores for all items
    const itemsWithScores = await Promise.all(
      items.map(async (item) => {
        const store = item.store
        const lat = store.latitude
        const lon = store.longitude
        if (lat == null || lon == null || !store.isVerified) return null

        const distance = calculateDistance(userLat, userLon, lat, lon)
        if (distance > maxDistance) return null

        const score = await calculateItemScore(item, store, distance, marketAveragePrice)

        return {
          ...item,
          store: { 
            ...store, 
            distance: parseFloat(distance.toFixed(2)),
            isNewSeller: store.createdAt > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          },
          score,
        }
      })
    )

    const validItems = itemsWithScores.filter((x): x is NonNullable<typeof x> => x !== null)

    // Sort by score (highest first), but ensure variety:
    // - Mix high-performing stores with new sellers
    // - Consider distance for very close items
    validItems.sort((a, b) => {
      // If scores are very close (< 5 points difference), prioritize:
      // 1. New sellers if they're within 5km
      // 2. Closer items
      if (Math.abs(a.score - b.score) < 5) {
        // New seller boost
        if (a.store.isNewSeller && a.store.distance < 5 && !b.store.isNewSeller) return -1
        if (b.store.isNewSeller && b.store.distance < 5 && !a.store.isNewSeller) return 1
        
        // Distance tie-breaker
        if (Math.abs(a.store.distance - b.store.distance) > 2) {
          return a.store.distance - b.store.distance
        }
      }

      return b.score - a.score
    })

    // Remove score from final output
    const finalItems = validItems.slice(0, limit).map(({ score, ...item }) => ({
      ...item,
      store: {
        ...item.store,
        isNewSeller: undefined, // Remove internal flag
      },
    }))

    return NextResponse.json({ items: finalItems })
  } catch (error) {
    console.error('Error fetching featured grocery items:', error)
    return NextResponse.json({ error: 'Failed to fetch featured items' }, { status: 500 })
  }
}
