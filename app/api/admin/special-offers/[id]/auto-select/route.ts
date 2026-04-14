import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
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

function norm(s: string) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ")
}

interface VendorScore {
  userId: string
  name: string
  lat?: number | null
  lon?: number | null
  score: number
  locationScore: number
  categoryScore: number
  salesScore: number
  reviewScore: number
  frequencyScore: number
  distanceKm?: number
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    

    const offer = await prisma.specialOffer.findUnique({
      where: { id: params.id },
      include: { vendors: true },
    } as any)
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    // Note: Removed enableAiSelection check - system-based selection is always available

    const body = await request.json().catch(() => ({}))
    const limit: number | null = body?.limit != null ? Number(body.limit) : null
    const fairnessDays: number = body?.fairnessDays != null ? Number(body.fairnessDays) : 30

    const offerAny = offer as any
    console.log(`[auto-select] Offer: ${offerAny.title}, Module: ${offerAny.module}`)
    console.log(`[auto-select] Location: lat=${offerAny.locationLatitude}, lon=${offerAny.locationLongitude}, radius=${offerAny.locationRadiusKm}km`)
    console.log(`[auto-select] Conditions:`, JSON.stringify(offerAny.conditions, null, 2))
    
    const already = new Set((offerAny.vendors || []).map((v: any) => v.vendorId))
    console.log(`[auto-select] Already invited vendors: ${already.size}`)
    const maxToPick = Math.max(
      0,
      Math.min(
        limit ?? 50,
        offerAny.maxVendors != null ? offerAny.maxVendors - already.size : (limit ?? 50)
      )
    )

    if (maxToPick <= 0) {
      return NextResponse.json({ success: true, invited: 0, reason: "Offer is full or limit is 0" })
    }

    // Location requirement for selection
    const hasLocation =
      offerAny.locationLatitude != null &&
      offerAny.locationLongitude != null &&
      offerAny.locationRadiusKm != null

    const centerLat = offerAny.locationLatitude ?? null
    const centerLon = offerAny.locationLongitude ?? null
    const radiusKm = offerAny.locationRadiusKm ?? null

    // Parse offer conditions
    let conditions: any = offerAny.conditions
    if (typeof conditions === "string") {
      try {
        conditions = JSON.parse(conditions)
      } catch {
        conditions = {}
      }
    }

    const module = offerAny.module as any
    const candidates: Array<{ userId: string; storeId?: string; name: string; rating: number; totalOrders: number; lat?: number | null; lon?: number | null }> = []

    // Build candidates by module (matching vendor route logic)
    if (module === "PHARMACY") {
      // Check all pharmacies regardless of status first, then filter
      const allPharmacyRows = await prisma.pharmacy.findMany({
        select: { id: true, userId: true, pharmacyName: true, rating: true, totalOrders: true, lat: true, lon: true, status: true },
        take: 1000,
      })
      console.log(`[auto-select] Found ${allPharmacyRows.length} total pharmacies in database`)
      
      // Filter by status - try APPROVED first, but also check if any exist
      const rows = allPharmacyRows.filter(r => r.status === "APPROVED")
      console.log(`[auto-select] After status filter (APPROVED): ${rows.length} pharmacies`)
      
      // If no APPROVED pharmacies, log status distribution
      if (rows.length === 0) {
        const statusCounts = new Map<string, number>()
        for (const r of allPharmacyRows) {
          const status = r.status || "UNKNOWN"
          statusCounts.set(status, (statusCounts.get(status) || 0) + 1)
        }
        console.log(`[auto-select] Pharmacy status distribution:`, Object.fromEntries(statusCounts))
      }
      
      for (const r of rows) {
        // Only include pharmacies with products in stock (matching vendor route)
        const productCount = await prisma.pharmacyMedicine.count({
          where: { pharmacyId: r.id, isAvailable: true, stock: { gt: 0 } },
        })
        if (productCount > 0) {
          candidates.push({ userId: r.userId, storeId: r.id, name: r.pharmacyName, rating: r.rating ?? 0, totalOrders: r.totalOrders ?? 0, lat: r.lat, lon: r.lon })
        } else {
          console.log(`[auto-select] Skipped pharmacy ${r.pharmacyName} (${r.id}): no products in stock (productCount=${productCount})`)
        }
      }
      console.log(`[auto-select] After product check: ${candidates.length} pharmacy candidates`)
    } else if (module === "GROCERY") {
      const rows = await prisma.groceryStore.findMany({
        where: { isOpen: true },
        select: { id: true, userId: true, storeName: true, rating: true, totalOrders: true, latitude: true, longitude: true },
        take: 1000,
      })
      console.log(`[auto-select] Found ${rows.length} grocery stores with isOpen=true`)
      
      for (const r of rows) {
        // Only include stores with active products (matching vendor route)
        const productCount = await prisma.groceryProduct.count({
          where: { storeId: r.id, isActive: true },
        })
        if (productCount > 0) {
          candidates.push({ userId: r.userId, storeId: r.id, name: r.storeName, rating: r.rating ?? 0, totalOrders: r.totalOrders ?? 0, lat: r.latitude, lon: r.longitude })
        } else {
          console.log(`[auto-select] Skipped grocery store ${r.storeName} (${r.id}): no active products`)
        }
      }
      console.log(`[auto-select] After product check: ${candidates.length} grocery candidates`)
    } else if (module === "FOOD") {
      const rows = await prisma.restaurant.findMany({
        where: { isOpen: true },
        select: { id: true, userId: true, name: true, rating: true, totalOrders: true, latitude: true, longitude: true },
        take: 1000,
      })
      console.log(`[auto-select] Found ${rows.length} restaurants with isOpen=true`)
      
      for (const r of rows) {
        // Only include restaurants with available menu items (matching vendor route)
        const productCount = await prisma.menuItem.count({
          where: { restaurantId: r.id, isAvailable: true },
        })
        if (productCount > 0) {
          candidates.push({ userId: r.userId, storeId: r.id, name: r.name, rating: r.rating ?? 0, totalOrders: r.totalOrders ?? 0, lat: r.latitude, lon: r.longitude })
        } else {
          console.log(`[auto-select] Skipped restaurant ${r.name} (${r.id}): no available menu items`)
        }
      }
      console.log(`[auto-select] After product check: ${candidates.length} food candidates`)
    } else if (module === "AUTO_PARTS") {
      const rows = await prisma.autoPartsStore.findMany({
        where: { isActive: true },
        select: { id: true, userId: true, storeName: true, rating: true, totalOrders: true, latitude: true, longitude: true },
        take: 1000,
      })
      console.log(`[auto-select] Found ${rows.length} auto parts stores with isActive=true`)
      
      for (const r of rows) {
        // Only include stores with active products (matching vendor route)
        const productCount = await prisma.product.count({
          where: { vendorId: r.userId, type: "AUTO_PART", isActive: true },
        })
        if (productCount > 0) {
          candidates.push({ userId: r.userId, storeId: r.id, name: r.storeName, rating: r.rating ?? 0, totalOrders: r.totalOrders ?? 0, lat: r.latitude, lon: r.longitude })
        } else {
          console.log(`[auto-select] Skipped auto parts store ${r.storeName} (${r.id}): no active products`)
        }
      }
      console.log(`[auto-select] After product check: ${candidates.length} auto parts candidates`)
    }

    console.log(`[auto-select] Total candidates after all filters: ${candidates.length} for module ${module}`)

    // Fairness: avoid vendors who received invitations recently
    const cutoff = new Date(Date.now() - fairnessDays * 24 * 60 * 60 * 1000)
    const recent = await (prisma as any).specialOfferVendor.findMany({
      where: { module, invitedAt: { gte: cutoff } },
      select: { vendorId: true },
    })
    const recentlyInvited = new Set(recent.map((r: any) => r.vendorId))

    // Get recent sales data (last 30 days) for all candidates
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const recentOrdersByVendor = new Map<string, { count: number; revenue: number }>()
    
    const recentOrders = await prisma.order.findMany({
      where: {
        vendorId: { in: candidates.map(c => c.userId) },
        module,
        status: "DELIVERED",
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        vendorId: true,
        total: true,
      },
    })

    
    for (const order of recentOrders) {
      if (!order.vendorId) continue
      const existing = recentOrdersByVendor.get(order.vendorId) || { count: 0, revenue: 0 }
      recentOrdersByVendor.set(order.vendorId, {
        count: existing.count + 1,
        revenue: existing.revenue + (Number(order.total) || 0),
      })
    }

    // Do not invite vendors who already have an active offer participation
    const nowActive = new Date()
    const activeParticipation = await (prisma as any).specialOfferVendor.findMany({
      where: {
        vendorId: { in: candidates.map(c => c.userId) },
        status: {
          in: ["INVITED", "ACCEPTED", "SUBMITTED_PRODUCT", "APPROVED"],
        },
        offer: {
          isActive: true,
          validUntil: { gte: nowActive },
        },
      },
      select: { vendorId: true },
    })
    const busyVendorIds = new Set((activeParticipation || []).map((r: any) => r.vendorId))

    // Get reviews for all candidates
    const reviewsByVendor = new Map<string, { avgRating: number; count: number }>()
    const allReviews = await prisma.review.findMany({
      where: {
        targetId: { in: candidates.map(c => c.userId) },
        targetType: "VENDOR",
      },
      select: {
        targetId: true,
        rating: true,
      },
    })

    const reviewGroups = new Map<string, number[]>()
    for (const review of allReviews) {
      if (!review.targetId) continue
      const existing = reviewGroups.get(review.targetId) || []
      existing.push(review.rating)
      reviewGroups.set(review.targetId, existing)
    }

    for (const entry of Array.from(reviewGroups.entries())) {
      const [vendorId, ratings] = entry
      const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length
      reviewsByVendor.set(vendorId, { avgRating, count: ratings.length })
    }

    // Get category matches for pharmacy offers (matching vendor route logic)
    const categoryMatches = new Map<string, boolean>()
    if (module === "PHARMACY" && Array.isArray(conditions?.medicineCategories) && conditions.medicineCategories.length > 0) {
      const requiredCategories = new Set(conditions.medicineCategories.map((c: string) => norm(c)))
      console.log(`[auto-select] Checking category matches for ${candidates.length} pharmacy candidates. Required categories:`, Array.from(requiredCategories))
      
      // Batch process category checks
      for (const candidate of candidates) {
        if (!candidate.storeId) {
          categoryMatches.set(candidate.userId, false)
          continue
        }
        
        const medicines = await prisma.pharmacyMedicine.findMany({
          where: {
            pharmacyId: candidate.storeId,
            isAvailable: true,
            stock: { gt: 0 },
          },
          select: {
            centralMedicine: {
              select: { category: true },
            },
          },
        })
        
        const vendorCategories = new Set(
          medicines
            .map(m => norm((m.centralMedicine as any)?.category || ""))
            .filter(Boolean)
        )
        
        let hasMatch = false
        for (const reqCat of Array.from(requiredCategories) as string[]) {
          if (vendorCategories.has(reqCat)) {
            hasMatch = true
            break
          }
        }
        categoryMatches.set(candidate.userId, hasMatch)
      }
      
      const matchedCount = Array.from(categoryMatches.values()).filter(Boolean).length
      console.log(`[auto-select] Category matching: ${matchedCount}/${candidates.length} vendors have matching categories`)
    } else if (module === "PHARMACY") {
      // If no medicineCategories requirement, all candidates pass category check
      for (const candidate of candidates) {
        categoryMatches.set(candidate.userId, true)
      }
      console.log(`[auto-select] No category requirement for pharmacy offer - all candidates pass`)
    }

    // Calculate scores for each candidate
    const scored: VendorScore[] = []
    let skippedAlready = 0
    let skippedRecently = 0
    let skippedBusy = 0
    let skippedLocation = 0
    let skippedCategory = 0

    for (const candidate of candidates) {
      // Skip if already invited or recently invited
      if (already.has(candidate.userId)) {
        skippedAlready++
        continue
      }
      if (recentlyInvited.has(candidate.userId)) {
        skippedRecently++
        continue
      }
      if (busyVendorIds.has(candidate.userId)) {
        skippedBusy++
        continue
      }

      // Location filter
      if (hasLocation) {
        if (candidate.lat == null || candidate.lon == null || centerLat == null || centerLon == null || radiusKm == null) {
          skippedLocation++
          continue
        }
        const distanceKm = haversineKm(centerLat, centerLon, candidate.lat, candidate.lon)
        if (distanceKm > radiusKm) {
          skippedLocation++
          continue
        }
      }

      // Category filter for pharmacy (matching vendor route - category is REQUIRED)
      if (module === "PHARMACY") {
        const hasCategoryMatch = categoryMatches.get(candidate.userId) ?? false
        if (!hasCategoryMatch && Array.isArray(conditions?.medicineCategories) && conditions.medicineCategories.length > 0) {
          skippedCategory++
          continue
        }
      }

      // Initialize scores
      let locationScore = 0
      let categoryScore = 0
      let salesScore = 0
      let reviewScore = 0
      let frequencyScore = 0

      // 1. Location Score (0-30 points): Closer = higher score
      if (hasLocation && candidate.lat != null && candidate.lon != null && centerLat != null && centerLon != null && radiusKm != null) {
        const distanceKm = haversineKm(centerLat, centerLon, candidate.lat, candidate.lon)
        const distanceRatio = Math.max(0, 1 - distanceKm / radiusKm) // 1.0 at center, 0.0 at edge
        locationScore = distanceRatio * 30
      } else {
        locationScore = 15 // Default if no location requirement
      }

      // 2. Category Match Score (0-25 points)
      if (module === "PHARMACY") {
        const hasCategoryMatch = categoryMatches.get(candidate.userId) ?? false
        categoryScore = hasCategoryMatch ? 25 : 0
      } else {
        // For non-pharmacy, category matching is optional (vendor route doesn't enforce it)
        categoryScore = 12.5 // Default
      }

      // 3. Recent Sales Score (0-20 points): Based on last 30 days orders
      const recentSales = recentOrdersByVendor.get(candidate.userId) || { count: 0, revenue: 0 }
      // Normalize: 0 orders = 0 points, 50+ orders = 20 points
      salesScore = Math.min(20, (recentSales.count / 50) * 20)
      
      

      // 4. Review Score (0-15 points): Based on average rating
      const reviews = reviewsByVendor.get(candidate.userId)
      if (reviews && reviews.count > 0) {
        // 5.0 rating = 15 points, 0.0 rating = 0 points
        reviewScore = (reviews.avgRating / 5.0) * 15
      } else {
        reviewScore = 5 // Default for unrated vendors
      }

      // 5. Order Frequency Score (0-10 points): Based on orders per month
      const ordersPerMonth = candidate.totalOrders > 0 ? candidate.totalOrders / 12 : 0 // Rough estimate
      // Normalize: 0 orders/month = 0 points, 100+ orders/month = 10 points
      frequencyScore = Math.min(10, (ordersPerMonth / 100) * 10)

      const totalScore = locationScore + categoryScore + salesScore + reviewScore + frequencyScore
      

      scored.push({
        userId: candidate.userId,
        name: candidate.name,
        lat: candidate.lat,
        lon: candidate.lon,
        score: totalScore,
        locationScore,
        categoryScore,
        salesScore,
        reviewScore,
        frequencyScore,
        distanceKm: hasLocation && candidate.lat != null && candidate.lon != null && centerLat != null && centerLon != null
          ? haversineKm(centerLat, centerLon, candidate.lat, candidate.lon)
          : undefined,
      })
    }

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score)

    console.log(`[auto-select] Scoring summary:`, {
      totalCandidates: candidates.length,
      skippedAlready,
      skippedRecently,
      skippedLocation,
      skippedCategory,
      scored: scored.length,
      maxToPick,
    })

    const picked = scored.slice(0, maxToPick)
    if (picked.length === 0) {
      return NextResponse.json({
        success: true,
        invited: 0,
        reason: "No eligible vendors found for selection constraints",
        debug: {
          totalCandidates: candidates.length,
          skippedAlready,
          skippedRecently,
          skippedLocation,
          skippedCategory,
          scored: scored.length,
          hasLocation,
          hasCategoryRequirement: module === "PHARMACY" && Array.isArray(conditions?.medicineCategories) && conditions.medicineCategories.length > 0,
        },
      })
    }

    // Invite selected vendors
    await prisma.$transaction(async (tx: any) => {
      for (const p of picked) {
        await tx.specialOfferVendor.upsert({
          where: { offerId_vendorId: { offerId: offerAny.id, vendorId: p.userId } },
          update: {
            module,
            source: "AI_SELECTED", // Keep using AI_SELECTED for backward compatibility, but it's now system-based
            status: "INVITED",
            invitedAt: new Date(),
            respondedAt: null,
          },
          create: {
            offerId: offerAny.id,
            vendorId: p.userId,
            module,
            source: "AI_SELECTED",
            status: "INVITED",
            invitedAt: new Date(),
          },
        })
      }
    })

    // Send notifications
    await Promise.allSettled(
      picked.map((p) =>
        NotificationBridge.sendNotification({
          userId: p.userId,
          title: "Special Offer Opportunity",
          message: `You have been selected to participate in: ${offerAny.title}. Tap to view details.`,
          type: "SYSTEM",
          module: offerAny.module as any,
          data: {
            offerId: offerAny.id,
            actionType: "navigate",
            screen: "VendorSpecialOffers",
            params: [{ name: "offerId", value: offerAny.id }],
          },
          actionUrl: `/vendor/special-offers/${offerAny.id}`,
        })
      )
    )

    return NextResponse.json({
      success: true,
      invited: picked.length,
      details: picked.map(p => ({
        userId: p.userId,
        name: p.name,
        score: Math.round(p.score * 100) / 100,
        breakdown: {
          location: Math.round(p.locationScore * 100) / 100,
          category: Math.round(p.categoryScore * 100) / 100,
          sales: Math.round(p.salesScore * 100) / 100,
          review: Math.round(p.reviewScore * 100) / 100,
          frequency: Math.round(p.frequencyScore * 100) / 100,
        },
      })),
    })
  } catch (error: any) {
    console.error("System-based vendor selection error:", error)
    return NextResponse.json({ error: "Failed to select vendors" }, { status: 500 })
  }
}
