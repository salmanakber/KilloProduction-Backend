import { prisma } from "@/lib/prisma"
import { formatPropertyListingCard } from "@/lib/property-types"
import { mapPropertyTypeToEnum } from "@/lib/property-types"
import type { PropertyListingType } from "@prisma/client"

const ACTIVE_BOOKING_STATUSES = [
  "PENDING_PAYMENT",
  "PENDING_APPROVAL",
  "CONFIRMED",
  "CHECKED_IN",
  "ACTIVE",
] as const

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function textMatchScore(
  listing: { title: string; tagline: string | null; city: string; address: string },
  q: string
): number {
  if (!q?.trim()) return 0
  const query = q.trim().toLowerCase()
  const title = listing.title.toLowerCase()
  const city = listing.city.toLowerCase()
  const tagline = (listing.tagline || "").toLowerCase()
  const address = listing.address.toLowerCase()
  let score = 0
  if (title === query) score += 80
  else if (title.includes(query)) score += 50
  if (city.includes(query) || query.includes(city)) score += 35
  if (address.includes(query)) score += 25
  if (tagline.includes(query)) score += 15
  return score
}

function computeSmartScore(params: {
  textScore: number
  rating: number
  reviewCount: number
  bookingsCount: number
  distanceKm: number | null
  hostLastLoginAt: Date | null
  exactCityMatch: boolean
}): number {
  const {
    textScore,
    rating,
    reviewCount,
    bookingsCount,
    distanceKm,
    hostLastLoginAt,
    exactCityMatch,
  } = params

  let score = textScore
  score += rating * 12
  score += Math.min(reviewCount, 200) * 0.8
  score += Math.min(bookingsCount, 100) * 4
  if (exactCityMatch) score += 20

  if (distanceKm != null) {
    if (distanceKm <= 3) score += 40
    else if (distanceKm <= 8) score += 28
    else if (distanceKm <= 15) score += 15
    else if (distanceKm <= 30) score += 6
    else score -= Math.min(25, (distanceKm - 30) * 0.5)
  }

  if (hostLastLoginAt) {
    const hoursSince =
      (Date.now() - hostLastLoginAt.getTime()) / (1000 * 60 * 60)
    if (hoursSince <= 24) score += 18
    else if (hoursSince <= 72) score += 10
    else if (hoursSince <= 168) score += 4
  }

  return Math.round(score * 100) / 100
}

export type PropertySearchParams = {
  city?: string
  q?: string
  amenity?: string
  type?: string
  categorySlug?: string
  vendorId?: string
  status?: string
  latitude?: number
  longitude?: number
  radiusKm?: number
  checkIn?: string
  checkOut?: string
  page?: number
  limit?: number
}

export async function searchPropertyListings(params: PropertySearchParams) {
  const page = params.page || 1
  const limit = Math.min(params.limit || 30, 50)
  const skip = (page - 1) * limit
  const radiusKm = params.radiusKm ?? 40

  const where: Record<string, unknown> = {}
  if (params.vendorId) {
    where.vendorId = params.vendorId
  } else {
    where.status = (params.status || "ACTIVE") as "ACTIVE"
  }

  const cityFilter = params.city?.trim()
  if (cityFilter) {
    where.city = { contains: cityFilter.split(",")[0].trim(), mode: "insensitive" }
  }

  if (params.q?.trim()) {
    const q = params.q.trim()
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { tagline: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { address: { contains: q, mode: "insensitive" } },
    ]
  }

  if (params.categorySlug && params.categorySlug !== "all") {
    where.categorySlug = params.categorySlug.trim().toLowerCase()
  } else if (params.type && params.type !== "all") {
    try {
      where.type = mapPropertyTypeToEnum(params.type) as PropertyListingType
    } catch {
      /* ignore invalid type */
    }
  }

  const listings = await prisma.propertyListing.findMany({
    where,
    include: {
      vendor: {
        select: {
          id: true,
          name: true,
          avatar: true,
          phone: true,
          lastLoginAt: true,
        },
      },
      _count: {
        select: {
          bookings: {
            where: { status: { in: ["CONFIRMED", "CHECKED_IN", "ACTIVE", "COMPLETED"] } },
          },
        },
      },
    },
    take: 200,
  })

  const unavailableListingIds = new Set<string>()
  let hasDateRange = false

  if (params.checkIn && params.checkOut) {
    const checkIn = new Date(params.checkIn)
    const checkOut = new Date(params.checkOut)
    if (!Number.isNaN(checkIn.getTime()) && !Number.isNaN(checkOut.getTime())) {
      hasDateRange = true
      const listingIds = listings.map((l) => l.id)
      const [overlapping, blockedDates] = await Promise.all([
        prisma.propertyBooking.findMany({
          where: {
            listingId: { in: listingIds },
            status: { in: [...ACTIVE_BOOKING_STATUSES] },
            checkIn: { lt: checkOut },
            checkOut: { gt: checkIn },
          },
          select: { listingId: true },
        }),
        prisma.propertyBlockedDate.findMany({
          where: {
            listingId: { in: listingIds },
            date: { gte: checkIn, lt: checkOut },
          },
          select: { listingId: true },
        }),
      ])
      for (const o of overlapping) unavailableListingIds.add(o.listingId)
      for (const b of blockedDates) unavailableListingIds.add(b.listingId)
    }
  }

  const searchLat = params.latitude
  const searchLng = params.longitude
  const cityKey = cityFilter?.split(",")[0].trim().toLowerCase()

  const scored = listings.map((listing) => {
    let distanceKm: number | null = null
    if (
      searchLat != null &&
      searchLng != null &&
      listing.latitude != null &&
      listing.longitude != null
    ) {
      distanceKm = haversineKm(searchLat, searchLng, listing.latitude, listing.longitude)
    }

    const exactCityMatch = cityKey
      ? listing.city.toLowerCase().includes(cityKey)
      : false

    const textScore = textMatchScore(listing, params.q || cityFilter || "")
    const matchScore = computeSmartScore({
      textScore,
      rating: listing.rating,
      reviewCount: listing.reviewCount,
      bookingsCount: listing._count.bookings,
      distanceKm,
      hostLastLoginAt: listing.vendor?.lastLoginAt ?? null,
      exactCityMatch,
    })

    const availableForDates = hasDateRange ? !unavailableListingIds.has(listing.id) : true

    return {
      listing,
      distanceKm,
      matchScore,
      bookingsCount: listing._count.bookings,
      availableForDates,
    }
  })

  let filtered = scored
  if (searchLat != null && searchLng != null) {
    filtered = scored.filter(
      (s) => s.distanceKm == null || s.distanceKm <= radiusKm
    )
  }

  if (params.amenity && params.amenity !== "all") {
    const amenity = params.amenity
    filtered = filtered.filter((s) => {
      const amenities = Array.isArray(s.listing.amenities)
        ? (s.listing.amenities as string[])
        : []
      return amenities.includes(amenity)
    })
  }

  filtered.sort((a, b) => {
    if (a.availableForDates !== b.availableForDates) {
      return a.availableForDates ? -1 : 1
    }
    return b.matchScore - a.matchScore
  })

  const pageSlice = filtered.slice(skip, skip + limit)
  const pageListingIds = pageSlice.map((s) => s.listing.id)
  const now = new Date()
  const upcomingBookedRows =
    pageListingIds.length > 0
      ? await prisma.propertyBooking.findMany({
          where: {
            listingId: { in: pageListingIds },
            status: {
              in: [
                "PENDING_PAYMENT",
                "PENDING_APPROVAL",
                "CONFIRMED",
                "CHECKED_IN",
                "ACTIVE",
              ],
            },
            checkOut: { gt: now },
          },
          select: { listingId: true },
        })
      : []
  const hasUpcomingSet = new Set(upcomingBookedRows.map((r) => r.listingId))

  const properties = pageSlice.map(({ listing, distanceKm, matchScore, bookingsCount, availableForDates }) => {
    const card = formatPropertyListingCard(listing)
    const hostLastLogin = listing.vendor?.lastLoginAt
    let hostResponseLabel = "Usually responds quickly"
    if (hostLastLogin) {
      const hours = (Date.now() - hostLastLogin.getTime()) / (1000 * 60 * 60)
      if (hours <= 1) hostResponseLabel = "Responds within an hour"
      else if (hours <= 24) hostResponseLabel = "Responds within a day"
      else hostResponseLabel = "Host may take longer to respond"
    }
    return {
      ...card,
      distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
      matchScore,
      bookingsCount,
      hostResponseLabel,
      address: listing.address,
      type: listing.type,
      availableForDates,
      hasUpcomingBookings: hasUpcomingSet.has(listing.id),
      matchScore,
    }
  })

  return {
    properties,
    page,
    limit,
    total: filtered.length,
    searchMeta: {
      city: cityFilter || null,
      latitude: searchLat ?? null,
      longitude: searchLng ?? null,
      radiusKm,
      checkIn: params.checkIn || null,
      checkOut: params.checkOut || null,
    },
  }
}
