import { NextRequest, NextResponse } from 'next/server'
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

function isStoreOpen(openingHours: any, isOpenFlag: boolean): boolean {
  if (!isOpenFlag) return false
  if (!openingHours || typeof openingHours !== 'object') return isOpenFlag
  const now = new Date()
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const currentDay = dayNames[now.getDay()]
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const todayHours = (openingHours as Record<string, { open?: string; close?: string }>)[currentDay]
  if (!todayHours?.open || !todayHours?.close) return isOpenFlag
  return currentTime >= todayHours.open && currentTime <= todayHours.close
}

interface StorePerformanceMetrics {
  totalOrders: number
  recentOrders: number // Last 30 days
  totalRevenue: number
  recentRevenue: number // Last 30 days
  positiveReviews: number // Reviews >= 4 stars
  averagePrice: number
  priceCompetitiveness: number // 0-100 score
  newSellerBoost: number // Boost for stores < 90 days old
  performanceScore: number // Overall score
}

async function calculateStorePerformance(storeId: string, storeCreatedAt: Date, marketAveragePrice: number): Promise<StorePerformanceMetrics> {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const isNewSeller = storeCreatedAt > ninetyDaysAgo

  // Get all orders for this store (optimized: single query with date filter)
  const [allOrders, reviews, products] = await Promise.all([
    prisma.order.findMany({
      where: {
        groceryId: storeId,
        paymentStatus: 'PAID',
      },
      select: {
        total: true,
        createdAt: true,
      },
    }),
    prisma.review.findMany({
      where: {
        groceryId: storeId,
      },
      select: {
        rating: true,
      },
    }),
    prisma.groceryProduct.findMany({
      where: {
        storeId,
        isActive: true,
        stock: { gt: 0 },
      },
      select: {
        price: true,
      },
    }),
  ])

  // Filter recent orders from all orders
  const recentOrders = allOrders.filter(o => o.createdAt >= thirtyDaysAgo)

  const totalOrders = allOrders.length
  const recentOrdersCount = recentOrders.length
  const totalRevenue = allOrders.reduce((sum, o) => sum + (o.total || 0), 0)
  const recentRevenue = recentOrders.reduce((sum, o) => sum + (o.total || 0), 0)
  const positiveReviews = reviews.filter(r => (r.rating || 0) >= 4).length
  const averagePrice = products.length > 0
    ? products.reduce((sum, p) => sum + (p.price || 0), 0) / products.length
    : 0

  // Price competitiveness: compare to market average
  let priceCompetitiveness = 50
  if (averagePrice > 0 && marketAveragePrice > 0) {
    const priceRatio = averagePrice / marketAveragePrice
    if (priceRatio <= 0.8) priceCompetitiveness = 100 // 20%+ below market (very competitive)
    else if (priceRatio <= 0.9) priceCompetitiveness = 90 // 10-20% below market
    else if (priceRatio <= 1.0) priceCompetitiveness = 80 // At market average
    else if (priceRatio <= 1.1) priceCompetitiveness = 70 // 10% above market
    else if (priceRatio <= 1.2) priceCompetitiveness = 60 // 20% above market
    else priceCompetitiveness = 40 // 20%+ above market
  }

  // New seller boost: stores less than 90 days old get a boost
  const newSellerBoost = isNewSeller ? 20 : 0

  // Calculate overall performance score
  // Components:
  // - Sales performance (40%): Based on total orders and recent orders
  // - Review quality (30%): Based on positive reviews and rating
  // - Price competitiveness (20%): Based on price comparison
  // - New seller boost (10%): Bonus for new sellers
  const salesScore = Math.min(100, (totalOrders * 2) + (recentOrdersCount * 5))
  const reviewScore = Math.min(100, (positiveReviews * 10) + (reviews.length > 0 ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length) * 10 : 0))
  
  const performanceScore = 
    (salesScore * 0.4) +
    (reviewScore * 0.3) +
    (priceCompetitiveness * 0.2) +
    (newSellerBoost * 0.1)

  return {
    totalOrders,
    recentOrders: recentOrdersCount,
    totalRevenue,
    recentRevenue,
    positiveReviews,
    averagePrice,
    priceCompetitiveness,
    newSellerBoost,
    performanceScore,
  }
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
    const isOpen = searchParams.get('isOpen')

    if (!userLat || !userLon) {
      return NextResponse.json({ error: 'Location required', message: 'Please provide latitude and longitude' }, { status: 400 })
    }

    // First, calculate market average price (once for all stores)
    const allStoreProducts = await prisma.groceryProduct.findMany({
      where: {
        isActive: true,
        stock: { gt: 0 },
      },
      select: {
        price: true,
        storeId: true,
      },
    })

    // Calculate average price per store
    const storePrices = new Map<string, number[]>()
    allStoreProducts.forEach(p => {
      if (!storePrices.has(p.storeId)) {
        storePrices.set(p.storeId, [])
      }
      storePrices.get(p.storeId)!.push(p.price || 0)
    })

    const allAverages: number[] = []
    storePrices.forEach(prices => {
      if (prices.length > 0) {
        allAverages.push(prices.reduce((a, b) => a + b, 0) / prices.length)
      }
    })

    const marketAveragePrice = allAverages.length > 0
      ? allAverages.reduce((a, b) => a + b, 0) / allAverages.length
      : 100

    const stores = await prisma.groceryStore.findMany({
      where: {
        isVerified: true, // Only show verified stores
      },
      include: {
        products: {
          where: { isActive: true, stock: { gt: 0 } },
          select: { id: true, name: true, price: true, images: true, isFeatured: true },
          take: 5,
        },
        groceryOffers: {
          where: { isActive: true, startsAt: { lte: new Date() }, expiresAt: { gte: new Date() } },
          select: { id: true, title: true, discountType: true, discountValue: true },
          take: 1,
        },
        _count: { select: { products: { where: { isActive: true, stock: { gt: 0 } } } } },
      },
    })

    // Calculate performance metrics for all stores
    const storesWithMetrics = await Promise.all(
      stores.map(async (store) => {
        const lat = store.latitude
        const lon = store.longitude
        if (lat == null || lon == null) return null

        const distance = calculateDistance(userLat, userLon, lat, lon)
        if (distance > maxDistance) return null

        const isOpenNow = isStoreOpen(store.openingHours, store.isOpen)
        if (isOpen === 'true' && !isOpenNow) return null

        // Calculate performance metrics with market average
        const metrics = await calculateStorePerformance(store.id, store.createdAt, marketAveragePrice)

        let deliveryTime = '30-45 min'
        if (distance < 2) deliveryTime = '15-30 min'
        else if (distance < 5) deliveryTime = '20-35 min'
        else if (distance < 10) deliveryTime = '30-45 min'
        else deliveryTime = '45-60 min'

        return {
          id: store.id,
          name: store.storeName,
          description: store.description,
          address: store.address,
          phone: store.phone,
          email: store.email,
          website: store.website,
          logo: store.logo,
          coverImage: store.coverImage,
          rating: store.rating || 0,
          totalReviews: store.totalReviews || 0,
          totalOrders: metrics.totalOrders,
          recentOrders: metrics.recentOrders,
          totalRevenue: metrics.totalRevenue,
          recentRevenue: metrics.recentRevenue,
          positiveReviews: metrics.positiveReviews,
          averagePrice: metrics.averagePrice,
          priceCompetitiveness: metrics.priceCompetitiveness,
          isNewSeller: metrics.newSellerBoost > 0,
          performanceScore: metrics.performanceScore,
          deliveryTime,
          deliveryFee: store.deliveryFee,
          minOrderAmount: store.minOrderAmount,
          maxDeliveryDistance: store.maxDeliveryDistance,
          isOpen: isOpenNow,
          isVerified: store.isVerified,
          openingHours: store.openingHours,
          deliveryZones: store.deliveryZones,
          storeType: store.storeType,
          latitude: store.latitude,
          longitude: store.longitude,
          distance: parseFloat(distance.toFixed(2)),
          distanceDisplay: `${distance.toFixed(1)} km`,
          coordinates: { lat: store.latitude, lon: store.longitude },
          products: store.products,
          activeOffer: store.groceryOffers[0] || null,
          productsCount: store._count.products,
        }
      })
    )

    const validStores = storesWithMetrics.filter((s): s is NonNullable<typeof s> => s !== null)

    // Smart ranking algorithm:
    // 1. Prioritize distance for very close stores (< 2km)
    // 2. For stores > 2km, balance distance with performance
    // 3. Give new sellers a chance by mixing them in
    validStores.sort((a, b) => {
      // Very close stores (< 2km) get distance priority
      if (a.distance < 2 && b.distance >= 2) return -1
      if (a.distance >= 2 && b.distance < 2) return 1
      if (a.distance < 2 && b.distance < 2) {
        // Both close: prioritize performance
        return b.performanceScore - a.performanceScore
      }

      // For stores > 2km, use combined score
      // Distance score (inverse, normalized to 0-100)
      const maxDist = Math.max(...validStores.map(s => s.distance))
      const aDistScore = maxDist > 0 ? 100 * (1 - a.distance / maxDist) : 50
      const bDistScore = maxDist > 0 ? 100 * (1 - b.distance / maxDist) : 50

      // Combined score: 40% distance, 60% performance
      const aCombined = (aDistScore * 0.4) + (a.performanceScore * 0.6)
      const bCombined = (bDistScore * 0.4) + (b.performanceScore * 0.6)

      // If scores are very close, give new sellers a slight boost
      if (Math.abs(aCombined - bCombined) < 5) {
        if (a.isNewSeller && !b.isNewSeller) return -1
        if (!a.isNewSeller && b.isNewSeller) return 1
      }

      return bCombined - aCombined
    })

    const rankedStores = validStores.slice(0, limit)

    return NextResponse.json({
      stores: rankedStores,
      total: rankedStores.length,
      userLocation: { latitude: userLat, longitude: userLon },
    })
  } catch (error) {
    console.error('Error fetching nearby grocery stores:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
