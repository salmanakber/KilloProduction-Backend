import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

// Calculate distance between two coordinates (Haversine formula)
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
  return R * c
}

// Calculate request relevance score for a vendor
interface RequestScore {
  request: any
  score: number
  distance: number
  inventoryMatch: number
  responseRate: number
  rating: number
  specialization: number
}

async function calculateRequestScore(
  request: any,
  vendor: any,
  vendorProfile: any
): Promise<RequestScore> {
  let score = 0
  let distance = Infinity
  let inventoryMatch = 0
  let responseRate = 0
  let rating = 0
  let specialization = 0

  // 1. Distance Weighting (0-40 points)
  const customerLat = request.user?.addresses?.[0]?.latitude
  const customerLon = request.user?.addresses?.[0]?.longitude
  if (customerLat && customerLon && vendorProfile?.latitude && vendorProfile?.longitude) {
    distance = calculateDistance(
      customerLat,
      customerLon,
      vendorProfile.latitude,
      vendorProfile.longitude
    )
    // Closer = higher score, max 40 points for < 5km
    if (distance <= 5) score += 40
    else if (distance <= 10) score += 30
    else if (distance <= 20) score += 20
    else if (distance <= 50) score += 10
    else score += 5
  } else if (vendorProfile?.city === request.user?.addresses?.[0]?.city) {
    // Fallback: same city = 20 points
    score += 20
    distance = 0 // Unknown exact distance
  }

  // 2. Inventory Match (0-30 points)
  // Check if vendor has products matching the request, including vehicle compatibility
  const requestMake = (request.vehicleBrand || '').toLowerCase().trim()
  const requestModel = (request.vehicleModel || '').toLowerCase().trim()
  const requestYear = (request.vehicleYear || '').toLowerCase().trim()

  // Get products that match by name/description/brand
  const matchingProducts = await prisma.product.findMany({
    where: {
      vendorId: vendor.id,
      type: 'AUTO_PART',
      isActive: true,
      stockQuantity: { gt: 0 },
      OR: [
        { name: { contains: request.partName || '', mode: 'insensitive' } },
        { description: { contains: request.partName || '', mode: 'insensitive' } },
        { brand: { contains: request.vehicleBrand || '', mode: 'insensitive' } },
      ],
    },
  })

  // Check vehicle compatibility for each product
  let compatibilityMatches = 0
  for (const product of matchingProducts) {
    const productData = product as any
    const compatibilities = productData.vehicleCompatibilities
    if (compatibilities && Array.isArray(compatibilities)) {
      for (const compatibility of compatibilities) {
        const productMake = (compatibility.make || '').toLowerCase().trim()
        const productModel = (compatibility.model || '').toLowerCase().trim()
        const productYear = (compatibility.year || '').toLowerCase().trim()

        // Match make and model (year is optional but preferred)
        if (productMake === requestMake && productModel === requestModel) {
          compatibilityMatches++
          // Bonus if year also matches
          if (productYear === requestYear && requestYear) {
            compatibilityMatches++ // Count twice for year match
          }
          break
        }
      }
    } else {
      // Fallback: check brand field for legacy products
      if (requestMake && product.brand && product.brand.toLowerCase().includes(requestMake)) {
        compatibilityMatches++
      }
    }
  }

  inventoryMatch = Math.min(30, compatibilityMatches * 5) // 5 points per matching product, max 30
  score += inventoryMatch

  // 3. Response Rate (0-15 points)
  // Check vendor's past offer response rate
  const totalOffers = await prisma.partOffer.count({
    where: { vendorId: vendor.id },
  })
  const acceptedOffers = await prisma.partOffer.count({
    where: {
      vendorId: vendor.id,
      status: 'ACCEPTED',
    },
  })
  if (totalOffers > 0) {
    responseRate = (acceptedOffers / totalOffers) * 15
    score += responseRate
  } else {
    responseRate = 5 // New vendors get 5 points
    score += responseRate
  }

  // 4. Rating (0-10 points)
  // Get vendor's average rating from reviews
  const reviews = await prisma.review.findMany({
    where: {
      targetId: vendor.id,
      targetType: 'VENDOR',
    },
    select: { rating: true },
  })
  if (reviews.length > 0) {
    rating = (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 2 // Max 10 points
    score += rating
  } else {
    rating = 3 // Default 3 points for unrated vendors
    score += rating
  }

  // 5. Specialization (0-5 points)
  // Check if vendor specializes in the requested category
  const categoryProducts = await prisma.product.count({
    where: {
      vendorId: vendor.id,
      type: 'AUTO_PART',
      isActive: true,
      category: request.partType ? {
        name: { contains: request.partType || '', mode: 'insensitive' },
      } : undefined,
    },
  })
  const totalProducts = await prisma.product.count({
    where: {
      vendorId: vendor.id,
      type: 'AUTO_PART',
      isActive: true,
    },
  })
  if (totalProducts > 0) {
    specialization = (categoryProducts / totalProducts) * 5
    score += specialization
  }

  return {
    request,
    score,
    distance,
    inventoryMatch,
    responseRate,
    rating,
    specialization,
  }
}

// Check if vendor has too many recent requests (load balancing)
async function checkLoadBalance(vendorId: string, maxRequestsPerHour: number = 5): Promise<boolean> {
  const oneHourAgo = new Date()
  oneHourAgo.setHours(oneHourAgo.getHours() - 1)

  const recentRequests = await prisma.partRequest.count({
    where: {
      offers: {
        some: {
          vendorId,
          createdAt: { gte: oneHourAgo },
        },
      },
    },
  })

  return recentRequests < maxRequestsPerHour
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "20")
    const skip = (page - 1) * limit
    const status = searchParams.get("status")
    const city = searchParams.get("city")
    const minScore = parseFloat(searchParams.get("minScore") || "0") // Minimum relevance score
    const maxDistance = parseFloat(searchParams.get("maxDistance") || "50") // Max distance in km

    // Get vendor profile with location and vehicle makes
    const vendorProfile = await prisma.vendorProfile.findUnique({
      where: { userId: user.id },
    })

    // Get vendor with products for scoring
    const vendor = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        vendorProfile: true,
        vendorProducts: {
          where: {
            type: 'AUTO_PART',
            isActive: true,
          },
        },
      },
    })

    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 })
    }

    const where: any = {
      // status: status || "OPEN",
      status: {  notIn: ["CANCELLED", "COMPLETED", "EXPIRED" ] },
      expiresAt: { gt: new Date() },
    }



    // Filter by status if provided
    if (status) {
      where.status = status
    }

    // Fetch all matching requests
    const allRequests = await prisma.partRequest.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            addresses: {
              where: { isDefault: true },
              select: {
                latitude: true,
                longitude: true,
                city: true,
              },
              take: 1,
            },
          },
        },
        offers: {
          where: {
            vendorId: user.id,
          },
          select: {
            id: true,
            status: true,
            price: true,
          },
        },
        _count: {
          select: {
            offers: true,
          },
        },
      },
    })

    

    // Check load balancing
    const canAcceptMore = await checkLoadBalance(user.id)

    // Calculate scores for all requests
    const scoredRequests: RequestScore[] = []
    for (const req of allRequests) {
      // Skip if vendor already has an offer for this request
  

      // Filter by distance if coordinates available
      const customerLat = req.user?.addresses?.[0]?.latitude
      const customerLon = req.user?.addresses?.[0]?.longitude
      if (customerLat && customerLon && vendorProfile?.latitude && vendorProfile?.longitude) {

        const distance = calculateDistance(
          customerLat,
          customerLon,
          vendorProfile.latitude,
          vendorProfile.longitude
        )
        
        if (distance > maxDistance) continue
        
      }

      // Filter by vehicle makes if vendor has makes specified and request has a vehicle make
      // Only filter if vendor has explicitly set vehicle makes (backward compatibility)
      const requestVehicleMake = (req.vehicleBrand || '').toLowerCase().trim()
      const vendorProfileData = vendorProfile as any
      if (requestVehicleMake && vendorProfileData?.vehicleMakes && Array.isArray(vendorProfileData.vehicleMakes)) {
        const vendorMakes = vendorProfileData.vehicleMakes.map((make: string) => make.toLowerCase().trim())
        const hasMatchingMake = vendorMakes.some((make: string) => make === requestVehicleMake)
        
        // If vendor has specified makes but request's make doesn't match, skip this request
        // This ensures vendors only see requests for vehicle makes they support
        if (!hasMatchingMake) {
          continue
        }
      }
      

      const requestScore = await calculateRequestScore(req, vendor, vendorProfile)
      
      // Filter by minimum score
      if (requestScore.score >= minScore) {
        scoredRequests.push(requestScore)
      }
    }
    

    // Sort by score (highest first)
    scoredRequests.sort((a, b) => b.score - a.score)

    // Apply pagination
    const paginatedRequests = scoredRequests.slice(skip, skip + limit)
    const total = scoredRequests.length

    // Format requests with score information
    const requests = paginatedRequests.map((scored) => {
      const req = scored.request
      // Format vehicle compatibility
      const vehicleCompatibility = {
        make: req.vehicleBrand,
        model: req.vehicleModel,
        year: req.vehicleYear || null,
      }
      
      return {
        id: req.id,
        partName: req.partName,
        partType: req.partType,
        vehicleBrand: req.vehicleBrand,
        vehicleModel: req.vehicleModel,
        vehicleYear: req.vehicleYear,
        vehicleCompatibility, // Add vehicle compatibility object
        description: req.description,
        urgency: req.urgency,
        maxBudget: req.maxBudget,
        preferredCondition: req.preferredCondition,
        images: req.images,
        needsMechanic: (req as any).needsMechanic || false,
        status: req.status,
        expiresAt: req.expiresAt,
        customer: req.user,
        latitude: req.user?.addresses?.[0]?.latitude || null,
        longitude: req.user?.addresses?.[0]?.longitude || null,
        city: req.user?.addresses?.[0]?.city || null,
        hasMyOffer: req.offers.length > 0,
        myOffer: req.offers[0] || null,
        totalOffers: req._count.offers,
        createdAt: req.createdAt,
        // Add relevance score information
        relevanceScore: {
          total: Math.round(scored.score * 10) / 10, // Round to 1 decimal
          distance: Math.round(scored.distance * 10) / 10,
          inventoryMatch: Math.round(scored.inventoryMatch * 10) / 10,
          responseRate: Math.round(scored.responseRate * 10) / 10,
          rating: Math.round(scored.rating * 10) / 10,
          specialization: Math.round(scored.specialization * 10) / 10,
        },
      }
    })

    return NextResponse.json({
      requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Part requests fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch part requests" }, { status: 500 })
  }
}

