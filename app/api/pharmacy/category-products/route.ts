import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { serializePharmacyProductImages } from '@/lib/central-medicine-images'

// Haversine formula to calculate distance
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

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const categoryName = searchParams.get('categoryName')
    const userLat = parseFloat(searchParams.get('latitude') || '0')
    const userLon = parseFloat(searchParams.get('longitude') || '0')
    const maxDistance = parseFloat(searchParams.get('maxDistance') || '50')
    const sortBy = searchParams.get('sortBy') || 'topSelling'

    if (!categoryName) {
      return NextResponse.json({ error: 'Category name required' }, { status: 400 })
    }

    // Get nearby pharmacies
    const pharmacies = await prisma.pharmacy.findMany({
      where: {
        lat: { not: null },
        lon: { not: null },
      },
      select: {
        id: true,
        pharmacyName: true,
        logo: true,
        address: true,
        lat: true,
        lon: true,
      }
    })
console.log('pharmacies', pharmacies)
    const nearbyPharmacies = pharmacies
      .map(pharmacy => {
        if (!pharmacy.lat || !pharmacy.lon) return null
        const distance = calculateDistance(userLat, userLon, Number(pharmacy.lat), Number(pharmacy.lon))
        console.log('distance', distance , userLat, userLon, pharmacy.lat, pharmacy.lon)
        if (distance > maxDistance) return null
        return { ...pharmacy, distance }
      })
      .filter(p => p !== null)

    const nearbyPharmacyIds = nearbyPharmacies.map(p => p!.id)
console.log('nearbyPharmacyIds', nearbyPharmacyIds)
    if (nearbyPharmacyIds.length === 0) {
      return NextResponse.json({ products: [], message: 'No pharmacies nearby' })
    }

    // Find central medicines matching the category
    const centralMedicines = await prisma.centralMedicine.findMany({
        where: {
          isActive: true,
          illnessTypes: {
            array_contains: [categoryName],
          },
        },
      });
      
console.log('centralMedicines', centralMedicines , categoryName)
    const centralMedicineIds = centralMedicines.map(cm => cm.id)
console.log('centralMedicineIds', centralMedicineIds)
    // Get pharmacy medicines for these central medicines from nearby pharmacies
    const pharmacyMedicines = await prisma.pharmacyMedicine.findMany({
      where: {
        centralMedicineId: { in: centralMedicineIds },
        pharmacyId: { in: nearbyPharmacyIds },
        isAvailable: true,
        stock: { gt: 0 }
      },
      include: {
        centralMedicine: true,
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true,
            logo: true,
            address: true,
            lat: true,
            lon: true,
          }
        }
      }
    })
console.log(pharmacyMedicines)
    // Get sales and reviews data
    const productIds = pharmacyMedicines.map(pm => pm.id)
    
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [salesData, reviewsData] = await Promise.all([
      prisma.orderItem.groupBy({
        by: ['productId'],
        where: {
          productId: { in: productIds },
          order: {
            status: { in: ['DELIVERED'] },
            createdAt: { gte: thirtyDaysAgo }
          }
        },
        _sum: {
          quantity: true
        }
      }),
      Promise.all(
        productIds.map(async (id) => {
          const reviews = await prisma.review.aggregate({
            where: { productId: id },
            _avg: { rating: true },
            _count: { id: true }
          })
          return { productId: id, ...reviews }
        })
      )
    ])

    // Build products array with all data
    let products = pharmacyMedicines.map(pm => {
      const pharmacy = nearbyPharmacies.find(p => p?.id === pm.pharmacyId)
      const sales = salesData.find(s => s.productId === pm.id)
      const reviews = reviewsData.find(r => r.productId === pm.id)
      const { image, images } = serializePharmacyProductImages(pm.centralMedicine.images)

      return {
        id: pm.id,
        name: pm.centralMedicine.name,
        genericName: pm.centralMedicine.genericName,
        brand: pm.centralMedicine.manufacturer || 'Generic',
        info: pm.centralMedicine.description?.substring(0, 100) || '',
        price: `$${pm.price.toFixed(2)}`,
        priceValue: pm.price,
        rating: reviews?._avg.rating || 4.5,
        reviews: reviews?._count.id || 0,
        image,
        images,
        inStock: pm.stock > 0,
        fastDelivery: pharmacy && pharmacy.distance < 5,
        totalSold: sales?._sum?.quantity || 0,
        pharmacy: {
          id: pm.pharmacy.id,
          name: pm.pharmacy.pharmacyName,
          logo: pm.pharmacy.logo || '',
          address: pm.pharmacy.address || '',
          distance: pharmacy?.distance.toFixed(1) || 'N/A'
        }
      }
    })

    // Sort products
    if (sortBy === 'topSelling') {
      products.sort((a, b) => b.totalSold - a.totalSold)
    } else if (sortBy === 'topRated') {
      products.sort((a, b) => b.rating - a.rating)
    } else if (sortBy === 'price') {
      products.sort((a, b) => a.priceValue - b.priceValue)
    }

    return NextResponse.json({ 
      products,
      total: products.length,
      category: categoryName
    })
  } catch (error) {
    console.error('Error fetching category products:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

