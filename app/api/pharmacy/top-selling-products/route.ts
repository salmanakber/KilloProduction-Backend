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
    const limit = parseInt(searchParams.get('limit') || '10')

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
        address: true,
        lat: true,
        lon: true,
      }
    })

    // Filter nearby pharmacies and add distance
    const nearbyPharmacies = pharmacies
      .map(pharmacy => {
        if (!pharmacy.lat || !pharmacy.lon) return null
        const distance = calculateDistance(userLat, userLon, Number(pharmacy.lat), Number(pharmacy.lon))
        if (distance > maxDistance) return null
        return {
          ...pharmacy,
          distance
        }
      })
      .filter(p => p !== null)
      .sort((a, b) => a!.distance - b!.distance)

    const nearbyPharmacyIds = nearbyPharmacies.map(p => p!.id)

    if (nearbyPharmacyIds.length === 0) {
      return NextResponse.json({ 
        products: [],
        message: 'No pharmacies found nearby'
      })
    }
    console.log('✅ Nearby pharmacies 1234:', nearbyPharmacyIds)

    // Get pharmacy medicines from nearby pharmacies
    const pharmacyMedicines = await prisma.pharmacyMedicine.findMany({
      where: {
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

    const productIds = pharmacyMedicines.map(pm => pm.id)

    if (productIds.length === 0) {
      return NextResponse.json({ 
        products: [],
        message: 'No products available from nearby pharmacies'
      })
    }
    console.log('✅ Product IDs 1234:', productIds)

    // Get total sales for each product (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const sales = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        productId: { in: productIds },
        order: {
          status: { in: ['DELIVERED'] },
          createdAt: { gte: thirtyDaysAgo }
        }
      },
      _sum: {
        quantity: true,
        totalPrice: true
      },
      _count: {
        _all: true
      }
    })

    console.log('✅ Sales 1234:', sales)
    // Sort by sales and get top products
    const topSales = sales
      .sort((a, b) => {
        const bQty = b._sum?.quantity || 0
        const aQty = a._sum?.quantity || 0
        return bQty - aQty
      })
      .slice(0, limit)

    // Get product details with real reviews
    let topProducts = await Promise.all(
      topSales.map(async (sale) => {
        const pharmacyMedicine = pharmacyMedicines.find(pm => pm.id === sale.productId)
        if (!pharmacyMedicine) return null

        const pharmacy = nearbyPharmacies.find(p => p?.id === pharmacyMedicine.pharmacyId)
        console.log('✅ Pharmacy 1234:', pharmacy)

        // Get real reviews for this product
        const productReviews = await prisma.review.aggregate({
          where: {
            productId: pharmacyMedicine.id
          },
          _avg: {
            rating: true
          },
          _count: {
            id: true
          }
        })

        const { image, images } = serializePharmacyProductImages(pharmacyMedicine.centralMedicine.images)
        return {
          id: pharmacyMedicine.id,
          name: pharmacyMedicine.centralMedicine.name,
          genericName: pharmacyMedicine.centralMedicine.genericName,
          brand: pharmacyMedicine.centralMedicine.manufacturer || 'Generic',
          info: pharmacyMedicine.centralMedicine.description?.substring(0, 100) || '',
          price: `$${pharmacyMedicine.price.toFixed(2)}`,
          priceValue: pharmacyMedicine.price,
          rating: productReviews._avg.rating || 4.5,
          reviews: productReviews._count.id || 0,
          image,
          images,
          discount: null,
          inStock: pharmacyMedicine.stock > 0,
          fastDelivery: pharmacy && pharmacy.distance < 5,
          totalSold: sale._sum?.quantity || 0,
          pharmacy: {
            id: pharmacyMedicine.pharmacy.id,
            name: pharmacyMedicine.pharmacy.pharmacyName,
            logo: pharmacyMedicine.pharmacy.logo,
            address: pharmacyMedicine.pharmacy.address,
            distance: pharmacy?.distance.toFixed(1) || 'N/A'
          }
        }
      })
    )

    topProducts = topProducts.filter(p => p !== null)

    console.log('✅ Top products 1234:', topProducts)

    // If no top-selling products found, show 3-5 random products
    if (topProducts.length === 0) {
      const randomCount = Math.floor(Math.random() * 3) + 3 // 3 to 5 products
      const shuffled = pharmacyMedicines.sort(() => 0.5 - Math.random())
      const randomProducts = shuffled.slice(0, randomCount)

      topProducts = await Promise.all(
        randomProducts.map(async (pharmacyMedicine) => {
          const pharmacy = nearbyPharmacies.find(p => p?.id === pharmacyMedicine.pharmacyId)

          // Get real reviews for this product
          const productReviews = await prisma.review.aggregate({
            where: {
              productId: pharmacyMedicine.id
            },
            _avg: {
              rating: true
            },
            _count: {
              id: true
            }
          })

          const { image, images } = serializePharmacyProductImages(pharmacyMedicine.centralMedicine.images)
          return {
            id: pharmacyMedicine.id,
            name: pharmacyMedicine.centralMedicine.name,
            genericName: pharmacyMedicine.centralMedicine.genericName,
            brand: pharmacyMedicine.centralMedicine.manufacturer || 'Generic',
            info: pharmacyMedicine.centralMedicine.description?.substring(0, 100) || '',
            price: `$${pharmacyMedicine.price.toFixed(2)}`,
            priceValue: pharmacyMedicine.price,
            rating: productReviews._avg.rating || 4.5,
            reviews: productReviews._count.id || 0,
            image,
            images,
            discount: null,
            inStock: pharmacyMedicine.stock > 0,
            fastDelivery: pharmacy && pharmacy.distance < 5,
            totalSold: 0,
            pharmacy: {
              id: pharmacyMedicine.pharmacy.id,
              name: pharmacyMedicine.pharmacy.pharmacyName,
              logo: pharmacyMedicine.pharmacy.logo,
              address: pharmacyMedicine.pharmacy.address,
              distance: pharmacy?.distance.toFixed(1) || 'N/A'
            }
          }
        })
      )
    }

    return NextResponse.json({ 
      products: topProducts,
      total: topProducts.length,
      nearbyPharmacies: nearbyPharmacies.length,
      isRandomSelection: topProducts.length > 0 && topProducts[0] !== null && topProducts[0].totalSold === 0
    })
  } catch (error) {
    console.error('Error fetching top selling products:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

