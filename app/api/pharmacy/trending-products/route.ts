import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { serializePharmacyProductImages } from '@/lib/central-medicine-images'

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

    // Get date ranges
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const twoDaysAgo = new Date(today)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

    // Get all pharmacies with location
    const pharmacies = await prisma.pharmacy.findMany({
      where: {
        lat: { not: null },
        lon: { not: null },
      },
      select: {
        id: true,
        pharmacyName: true,
        logo: true,
        lat: true,
        lon: true,
      }
    })

    // Filter nearby pharmacies
    const nearbyPharmacies = pharmacies.filter(pharmacy => {
      if (!pharmacy.lat || !pharmacy.lon) return false
      const distance = calculateDistance(userLat, userLon, pharmacy.lat, pharmacy.lon)
      return distance <= maxDistance
    })

    const nearbyPharmacyIds = nearbyPharmacies.map(p => p.id)

    if (nearbyPharmacyIds.length === 0) {
      return NextResponse.json({ 
        products: [],
        message: 'No pharmacies found nearby'
      })
    }

    // Get pharmacy medicines from nearby pharmacies
    const pharmacyMedicines = await prisma.pharmacyMedicine.findMany({
      where: {
        pharmacyId: { in: nearbyPharmacyIds },
        isAvailable: true,
        stock: { gt: 0 }
      },
      select: {
        id: true,
        centralMedicineId: true,
        pharmacyId: true,
        price: true,
        stock: true,
      }
    })

    const productIds = pharmacyMedicines.map(pm => pm.id)

    if (productIds.length === 0) {
      return NextResponse.json({ 
        products: [],
        message: 'No products available from nearby pharmacies'
      })
    }

    // Get today's sales
    const todaySales = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        productId: { in: productIds },
        order: {
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
        productId: { in: productIds },
        order: {
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
        value.growth = 100 // New product sold today
      } else if (value.yesterday > 0) {
        value.growth = ((value.today - value.yesterday) / value.yesterday) * 100
      }
    })

    // Sort by growth and get top 3
    const sortedProducts = Array.from(salesMap.entries())
      .filter(([_, data]) => data.growth > 0)
      .sort((a, b) => b[1].growth - a[1].growth)
      .slice(0, 3)

    // Get product details
    const trendingProductIds = sortedProducts.map(([id, _]) => id)
    
    const trendingProducts = await Promise.all(
      trendingProductIds.map(async (productId) => {
        const pharmacyMedicine = pharmacyMedicines.find(pm => pm.id === productId)
        if (!pharmacyMedicine) return null

        const centralMedicine = await prisma.centralMedicine.findUnique({
          where: { id: pharmacyMedicine.centralMedicineId }
        })

        const pharmacy = nearbyPharmacies.find(p => p.id === pharmacyMedicine.pharmacyId)
        const salesData = salesMap.get(productId)

        if (!centralMedicine || !pharmacy) return null

        const { image, images } = serializePharmacyProductImages(centralMedicine.images)
        return {
          id: productId,
          name: centralMedicine.name,
          genericName: centralMedicine.genericName,
          price: pharmacyMedicine.price,
          image,
          images,
          icon: '💊',
          trend: `↗️ +${Math.round(salesData.growth)}%`,
          reason: `${salesData.today} sold today`,
          growth: salesData.growth,
          todaySales: salesData.today,
          yesterdaySales: salesData.yesterday,
          pharmacy: {
            id: pharmacy.id,
            name: pharmacy.pharmacyName,
            logo: pharmacy.logo
          }
        }
      })
    )

    const validProducts = trendingProducts.filter(p => p !== null)

    return NextResponse.json({ 
      products: validProducts,
      total: validProducts.length
    })
  } catch (error) {
    console.error('Error fetching trending products:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

