import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { searchPropertyListings } from "@/lib/property-listing-search"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const lat = searchParams.get("lat") ? Number.parseFloat(searchParams.get("lat")!) : undefined
    const lng = searchParams.get("lng") ? Number.parseFloat(searchParams.get("lng")!) : undefined
    const radiusKm = searchParams.get("radiusKm")
      ? Number.parseFloat(searchParams.get("radiusKm")!)
      : 45
    const limit = Math.min(Number.parseInt(searchParams.get("limit") || "8", 10), 20)

    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      return NextResponse.json({ error: "lat and lng are required" }, { status: 400 })
    }

    const { properties } = await searchPropertyListings({
      latitude: lat,
      longitude: lng,
      radiusKm,
      limit: 80,
      status: "ACTIVE",
    })

    const byVendor = new Map<
      string,
      {
        vendorId: string
        name: string
        avatar: string | null
        rating: number
        reviewsCount: number
        listingsCount: number
        topListingImage: string | null
        city: string
        matchScore: number
        distanceKm: number | null
      }
    >()

    for (const p of properties) {
      const vendorId = p.vendorId || p.host?.id
      if (!vendorId) continue
      const existing = byVendor.get(vendorId)
      const score =
        (p.matchScore || 0) +
        (p.rating || 0) * 12 +
        Math.min(p.reviews || 0, 100) * 0.6
      if (!existing) {
        byVendor.set(vendorId, {
          vendorId,
          name: p.host?.name || "Host",
          avatar: p.host?.avatar || null,
          rating: p.rating || 0,
          reviewsCount: p.reviews || 0,
          listingsCount: 1,
          topListingImage: p.image || null,
          city: p.city || "",
          matchScore: score,
          distanceKm: p.distanceKm ?? null,
        })
      } else {
        existing.listingsCount += 1
        existing.rating = Math.max(existing.rating, p.rating || 0)
        existing.reviewsCount += p.reviews || 0
        existing.matchScore = Math.max(existing.matchScore, score)
        if (
          p.distanceKm != null &&
          (existing.distanceKm == null || p.distanceKm < existing.distanceKm)
        ) {
          existing.distanceKm = p.distanceKm
        }
      }
    }

    const vendorIds = [...byVendor.keys()]
    if (vendorIds.length > 0) {
      const vendors = await prisma.user.findMany({
        where: { id: { in: vendorIds } },
        select: {
          id: true,
          name: true,
          avatar: true,
          isVerified: true,
          vendorProfile: { select: { businessName: true, city: true } },
        },
      })
      for (const v of vendors) {
        const row = byVendor.get(v.id)
        if (!row) continue
        row.name = v.vendorProfile?.businessName || v.name || row.name
        row.avatar = v.avatar || row.avatar
        row.city = v.vendorProfile?.city || row.city
      }
    }

    const hosts = [...byVendor.values()]
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit)
      .map((h) => ({
        id: h.vendorId,
        vendorId: h.vendorId,
        name: h.name,
        avatar: h.avatar,
        rating: Math.round(h.rating * 100) / 100,
        reviewsCount: h.reviewsCount,
        listingsCount: h.listingsCount,
        image: h.topListingImage,
        city: h.city,
        distanceKm: h.distanceKm,
        badge: h.rating >= 4.8 ? "TOP RATED" : h.listingsCount >= 3 ? "FEATURED HOST" : "HOST",
      }))

    return NextResponse.json({ success: true, hosts })
  } catch (error) {
    console.error("Nearby hosts error:", error)
    return NextResponse.json({ error: "Failed to load hosts" }, { status: 500 })
  }
}
