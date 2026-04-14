import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { serializePharmacyProductImages } from '@/lib/central-medicine-images'

// Haversine formula
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

// Check if pharmacy is open
function isPharmacyOpen(openingHours: any, is24Hours: boolean): boolean {
  if (is24Hours) return true
  if (!openingHours || typeof openingHours !== 'object') return false

  const now = new Date()
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const currentDay = dayNames[now.getDay()]
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const todayHours = openingHours[currentDay]
  if (!todayHours || !todayHours.open || !todayHours.close) return false

  return currentTime >= todayHours.open && currentTime <= todayHours.close
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const productId = params.id
    const { searchParams } = new URL(request.url)
    const userLat = parseFloat(searchParams.get('latitude') || '9.0820')
    const userLon = parseFloat(searchParams.get('longitude') || '8.6753')

    // Fetch pharmacy medicine with all related data
    const pharmacyMedicine = await prisma.pharmacyMedicine.findUnique({
      where: { id: productId },
      include: {
        centralMedicine: true,
        pharmacy: {
          include: {
            user: true
          }
        }
      }
    })

    if (!pharmacyMedicine) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Calculate distance to pharmacy
    let distance = 0
    if (pharmacyMedicine.pharmacy.lat && pharmacyMedicine.pharmacy.lon) {
      distance = calculateDistance(
        userLat,
        userLon,
        Number(pharmacyMedicine.pharmacy.lat),
        Number(pharmacyMedicine.pharmacy.lon)
      )
    }

    // Get reviews for this product
    const productReviews = await prisma.review.aggregate({
      where: { productId: pharmacyMedicine.id },
      _avg: { rating: true },
      _count: { id: true }
    })

    // Get sales data
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const salesData = await prisma.orderItem.aggregate({
      where: {
        productId: pharmacyMedicine.id,
        order: {
          status: { in: ['DELIVERED'] },
          createdAt: { gte: thirtyDaysAgo }
        }
      },
      _sum: {
        quantity: true
      }
    })

    // Check if pharmacy is open
    const isOpen = isPharmacyOpen(
      pharmacyMedicine.pharmacy.openingHours,
      pharmacyMedicine.pharmacy.is24Hours
    )

    const { image: coverImage, images: galleryImages } = serializePharmacyProductImages(
      pharmacyMedicine.centralMedicine.images
    )

    const product = {
      id: pharmacyMedicine.id,
      name: pharmacyMedicine.centralMedicine.name,
      genericName: pharmacyMedicine.centralMedicine.genericName,
      description: pharmacyMedicine.centralMedicine.description,
      purpose: pharmacyMedicine.centralMedicine.purpose,
      dosageInfo: pharmacyMedicine.centralMedicine.dosageInfo,
      warnings: pharmacyMedicine.centralMedicine.warnings,
      sideEffects: pharmacyMedicine.centralMedicine.sideEffects || [],
      category: pharmacyMedicine.centralMedicine.category,
      illnessTypes: pharmacyMedicine.centralMedicine.illnessTypes || [],
      activeIngredients: pharmacyMedicine.centralMedicine.activeIngredients || [],
      form: pharmacyMedicine.centralMedicine.form,
      strength: pharmacyMedicine.centralMedicine.strength,
      manufacturer: pharmacyMedicine.centralMedicine.manufacturer,
      /** Cover: primary URL only (null if unset) */
      image: coverImage,
      /** Ordered gallery (primary, secondary, img1, …) */
      images: galleryImages,
      price: pharmacyMedicine.price,
      stock: pharmacyMedicine.stock,
      minStock: pharmacyMedicine.minStock,
      isAvailable: pharmacyMedicine.isAvailable,
      expiryDate: pharmacyMedicine.expiryDate,
      batchNumber: pharmacyMedicine.batchNumber,
      rating: productReviews._avg.rating || 4.5,
      reviews: productReviews._count.id || 0,
      totalSold: salesData._sum.quantity || 0,
      pharmacy: {
        id: pharmacyMedicine.pharmacy.id,
        name: pharmacyMedicine.pharmacy.pharmacyName,
        logo: pharmacyMedicine.pharmacy.logo || '',
        address: pharmacyMedicine.pharmacy.address || '',
        distance: distance.toFixed(1),
        rating: pharmacyMedicine.pharmacy.rating,
        reviews: pharmacyMedicine.pharmacy.totalReviews,
        description: pharmacyMedicine.pharmacy.description || '',
        responseTime: pharmacyMedicine.pharmacy.responseTime,
        coverImage: pharmacyMedicine.pharmacy.coverImage || '',
        
        isOpen,
        user: pharmacyMedicine.pharmacy.user || null,
      }

    }

    return NextResponse.json({ product })
  } catch (error) {
    console.error('Error fetching product details:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

