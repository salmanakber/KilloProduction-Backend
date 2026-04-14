import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

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

// Calculate performance score
function calculatePerformanceScore(pharmacy: any): number {
  let score = 0
  
  // Rating weight: 40%
  score += (pharmacy.rating / 5) * 40
  
  // Response time weight: 20% (faster is better, max 60 minutes)
  const responseScore = Math.max(0, (60 - pharmacy.responseTime) / 60)
  score += responseScore * 20
  
  // Total orders weight: 20% (normalized, max 1000 orders)
  const ordersScore = Math.min(pharmacy.totalOrders / 1000, 1)
  score += ordersScore * 20
  
  // Reviews count weight: 10% (normalized, max 500 reviews)
  const reviewsScore = Math.min(pharmacy.totalReviews / 500, 1)
  score += reviewsScore * 10
  
  // Availability weight: 10%
  if (pharmacy.is24Hours) {
    score += 10
  } else if (pharmacy.isOpen) {
    score += 5
  }
  
  return score
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
    const maxDistance = parseFloat(searchParams.get('maxDistance') || '50')

    if (!userLat || !userLon) {
      return NextResponse.json({ 
        error: 'Location required',
        message: 'Please provide latitude and longitude'
      }, { status: 400 })
    }

    // Get all active pharmacies
    const pharmacies = await prisma.pharmacy.findMany({
      where: {
        lat: { not: null },
        lon: { not: null },
        status: 'APPROVED'
      },
      select: {
        id: true,
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
        rating: true,
        totalReviews: true,
        totalOrders: true,
        openingHours: true,
        is24Hours: true,
        responseTime: true,
        createdAt: true,
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

    // Process pharmacies with distance and performance
    const processedPharmacies = pharmacies
      .map(pharmacy => {
        if (!pharmacy.lat || !pharmacy.lon) return null

        const distance = calculateDistance(
          userLat,
          userLon,
          Number(pharmacy.lat),
          Number(pharmacy.lon)
        )

        if (distance > maxDistance) return null

        const isOpen = isPharmacyOpen(pharmacy.openingHours, pharmacy.is24Hours)
        const performanceScore = calculatePerformanceScore(pharmacy)
        
        // Check if pharmacy is new (registered in last 30 days)
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const isNewPharmacy = new Date(pharmacy.createdAt) > thirtyDaysAgo

        // Delivery time estimation
        let deliveryTime = '30-45 min'
        if (distance < 2) deliveryTime = '15-30 min'
        else if (distance < 5) deliveryTime = '20-35 min'
        else if (distance < 10) deliveryTime = '30-45 min'
        else deliveryTime = '45-60 min'

        return {
          id: pharmacy.id,
          name: pharmacy.pharmacyName || 'Pharmacy',
          description: pharmacy.description,
          address: pharmacy.address || '',
          phone: pharmacy.phone,
          email: pharmacy.email,
          website: pharmacy.website,
          distance: `${distance.toFixed(1)} km`,
          distanceValue: distance,
          rating: pharmacy.rating,
          reviews: pharmacy.totalReviews,
          isOpen,
          is24Hours: pharmacy.is24Hours,
          logo: pharmacy.logo,
          coverImage: pharmacy.coverImage,
          responseTime: pharmacy.responseTime,
          totalOrders: pharmacy.totalOrders,
          performanceScore,
          isNewPharmacy,
          deliveryTime,
          features: [
            ...(pharmacy.is24Hours ? ['24/7'] : []),
            ...(isOpen && !pharmacy.is24Hours ? ['Open Now'] : []),
            'Prescription',
            distance < 5 ? 'Fast Delivery' : 'Home Delivery',
            `${pharmacy._count.pharmacyMedicines} Products`
          ],
          openingHours: pharmacy.openingHours,
          productsCount: pharmacy._count.pharmacyMedicines
        }
      })
      .filter(p => p !== null)

    // Algorithm: Mix performance-based and new pharmacy promotion
    const newPharmacies = processedPharmacies.filter(p => p!.isNewPharmacy)
    const establishedPharmacies = processedPharmacies.filter(p => !p!.isNewPharmacy)

    // Sort established by performance score
    establishedPharmacies.sort((a, b) => b!.performanceScore - a!.performanceScore)

    // Sort new pharmacies by distance (give closer ones priority)
    newPharmacies.sort((a, b) => a!.distanceValue - b!.distanceValue)

    // Algorithm: Insert new pharmacy every 3-4 established pharmacies
    // This gives new pharmacies visibility while maintaining performance-based ranking
    const finalList: any[] = []
    let establishedIndex = 0
    let newIndex = 0
    let counter = 0

    // Determine current cycle (weekly/monthly)
    const now = new Date()
    const weekNumber = Math.floor(now.getDate() / 7)
    const isWeeklyCycle = weekNumber % 2 === 0 // Alternate between weekly and bi-weekly

    // On weekly cycle, insert new pharmacy every 3 items
    // On bi-weekly, insert every 4 items
    const insertInterval = isWeeklyCycle ? 3 : 4

    while (establishedIndex < establishedPharmacies.length || newIndex < newPharmacies.length) {
      counter++
      
      // Insert new pharmacy at intervals
      if (counter % insertInterval === 0 && newIndex < newPharmacies.length) {
        finalList.push(newPharmacies[newIndex])
        newIndex++
      } else if (establishedIndex < establishedPharmacies.length) {
        finalList.push(establishedPharmacies[establishedIndex])
        establishedIndex++
      } else if (newIndex < newPharmacies.length) {
        finalList.push(newPharmacies[newIndex])
        newIndex++
      }
    }

    return NextResponse.json({ 
      pharmacies: finalList,
      total: finalList.length,
      newPharmaciesCount: newPharmacies.length,
      algorithm: {
        cycle: isWeeklyCycle ? 'weekly' : 'bi-weekly',
        insertInterval,
        performanceWeight: 'Rating(40%), ResponseTime(20%), Orders(20%), Reviews(10%), Availability(10%)'
      }
    })
  } catch (error) {
    console.error('Error fetching pharmacy marketplace:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

