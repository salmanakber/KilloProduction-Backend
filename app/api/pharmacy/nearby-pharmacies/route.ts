import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { getPharmacyReviewStatsBatch } from '@/lib/pharmacy-review-stats'

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

// Check if pharmacy is currently open based on openingHours JSON
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
    const limit = parseInt(searchParams.get('limit') || '20')

    if (!userLat || !userLon) {
      return NextResponse.json({ 
        error: 'Location required',
        message: 'Please provide latitude and longitude'
      }, { status: 400 })
    }

    // Get all pharmacies with location
    const pharmacies = await prisma.pharmacy.findMany({
      where: {
        lat: { not: null },
        lon: { not: null },
      },
      select: {
        id: true,
        userId: true,
        pharmacyName: true,
        description: true,
        address: true,
        phone: true,
        email: true,
        website: true,
        logo: true,
        coverImage: true,
        lat: true,
        lon: true,
        openingHours: true,
        is24Hours: true,
        rating: true,
        totalReviews: true,
        createdAt: true,
        user: true,
        _count: {
          select: {
            pharmacyMedicines: {
              where: {
                isAvailable: true,
                stock: { gt: 0 }
              }
            }
          }
        }
      }
    })

    // Calculate distance and filter
    const pharmaciesWithDistance = pharmacies
      .map(pharmacy => {
        const distance = calculateDistance(
          userLat,
          userLon,
          Number(pharmacy.lat),
          Number(pharmacy.lon)
        )
      
        if (distance > maxDistance) return null

        // Determine if open based on actual opening hours
        const isOpen = isPharmacyOpen(pharmacy.openingHours, pharmacy.is24Hours)

        // Estimate delivery time based on distance
        let deliveryTime = '30-45 min'
        if (distance < 2) {
          deliveryTime = '15-30 min'
        } else if (distance < 5) {
          deliveryTime = '20-35 min'
        } else if (distance < 10) {
          deliveryTime = '30-45 min'
        } else {
          deliveryTime = '45-60 min'
        }

        return {
          id: pharmacy.id,
          vendorUserId: pharmacy.userId,
          name: pharmacy.pharmacyName || 'Pharmacy',
          description: pharmacy.description,
          address: pharmacy.address || 'Address not available',
          phone: pharmacy.phone,
          email: pharmacy.email,
          website: pharmacy.website,
          distance: `${distance.toFixed(1)} km`,
          distanceValue: distance,
          rating: pharmacy.rating || 0,
          reviews: pharmacy.totalReviews || 0,
          icon: '🏥',
          isOpen,
          is24Hours: pharmacy.is24Hours,
          openingHours: pharmacy.openingHours,
          deliveryTime,
          features: [
            ...(pharmacy.is24Hours ? ['24/7'] : []),
            ...(isOpen && !pharmacy.is24Hours ? ['Open Now'] : []),
            'Prescription',
            distance < 5 ? 'Fast Delivery' : 'Home Delivery'
          ],
          user: pharmacy.user,
          image: pharmacy.coverImage || pharmacy.logo || '🏢',
          logo: pharmacy.logo,
          coverImage: pharmacy.coverImage,
          productsCount: pharmacy._count.pharmacyMedicines,
          coordinates: {
            lat: pharmacy.lat,
            lon: pharmacy.lon
          }
        }
      })
      .filter(p => p !== null)
      .sort((a, b) => a!.distanceValue - b!.distanceValue)
      .slice(0, limit)

    const reviewStatsByPharmacy = await getPharmacyReviewStatsBatch(
      pharmaciesWithDistance.map((p) => p!.id)
    )
    const pharmaciesWithReviewRatings = pharmaciesWithDistance.map((p) => {
      const stats = reviewStatsByPharmacy.get(p!.id)
      return {
        ...p!,
        rating: stats?.roundedRating ?? 0,
        reviews: stats?.totalReviews ?? 0,
      }
    })

    return NextResponse.json({ 
      pharmacies: pharmaciesWithReviewRatings,
      total: pharmaciesWithDistance.length,
      userLocation: {
        latitude: userLat,
        longitude: userLon
      }
    })
  } catch (error) {
    console.error('Error fetching nearby pharmacies:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

