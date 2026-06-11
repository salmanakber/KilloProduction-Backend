import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import {
  formatPropertyListingCard,
  mapPropertyTypeFromEnum,
  mapPropertyTypeToEnum,
} from "@/lib/property-types"
import { computeListingHostStats, pickListingAccessFields } from "@/lib/property-listing-host-stats"
import {
  assertCanManagePropertyListings,
  listingsAccessDenied,
  resolvePropertyHostVendorId,
} from "@/lib/property-host-resolve"
import {
  getPropertyListingAvailability,
  isPropertyListingAvailableForRange,
} from "@/lib/property-listing-availability"
import { isValidPropertyGuestTier, normalizePropertyGuestTier } from "@/lib/property-guest-tier"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const listing = await prisma.propertyListing.findUnique({
      where: { id: params.id },
      include: {
        vendor: { select: { id: true, name: true, avatar: true, phone: true } },
        blockedDates: true,
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            customer: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
    })
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 })
    }

    const user = await authenticateRequest(request)
    const hostVendorId = user ? await resolvePropertyHostVendorId(user.id) : null
    const isOwner =
      !!user &&
      user.role === "VENDOR" &&
      (listing.vendorId === user.id || hostVendorId === listing.vendorId)

    const card = formatPropertyListingCard(listing)
    const hostStats = isOwner ? await computeListingHostStats(listing.id) : null
    const access = isOwner ? pickListingAccessFields(listing) : {}

    const { searchParams } = new URL(request.url)
    const checkInParam = searchParams.get("checkIn")
    const checkOutParam = searchParams.get("checkOut")
    let availableForDates: boolean | undefined
    let availabilityReason: string | undefined
    if (checkInParam && checkOutParam) {
      const checkIn = new Date(checkInParam)
      const checkOut = new Date(checkOutParam)
      if (!Number.isNaN(checkIn.getTime()) && !Number.isNaN(checkOut.getTime())) {
        const avail = await isPropertyListingAvailableForRange(listing.id, checkIn, checkOut)
        availableForDates = avail.available
        availabilityReason = avail.reason
      }
    }

    const calFrom = new Date()
    calFrom.setHours(0, 0, 0, 0)
    const calTo = new Date(calFrom)
    calTo.setMonth(calTo.getMonth() + 6)
    const calendarAvailability = await getPropertyListingAvailability(
      listing.id,
      calFrom,
      calTo
    )

    return NextResponse.json({
      success: true,
      listing: {
        ...card,
        ...access,
        hostStats,
        availableForDates,
        availabilityReason,
        bookedRanges: calendarAvailability.bookedRanges,
        unavailableDates: calendarAvailability.unavailableDates,
        hasUpcomingBookings: calendarAvailability.bookedRanges.length > 0,
        title: listing.title,
        tagline: listing.tagline,
        folderId: listing.folderId,
        categorySlug: listing.categorySlug,
        latitude: listing.latitude,
        longitude: listing.longitude,
        propertyTypeLabel: mapPropertyTypeFromEnum(listing.type),
        status: listing.status,
        description: listing.description,
        address: listing.address,
        state: listing.state,
        zip: listing.zip,
        country: listing.country,
        videoUrl: listing.videoUrl,
        tourUrl: listing.tourUrl,
        cleaningFee: listing.cleaningFee,
        securityDeposit: listing.securityDeposit,
        discountPercent: listing.discountPercent,
        nightlyRate: listing.nightlyRate,
        sqm: listing.sqm,
        bedrooms: listing.bedrooms,
        beds: listing.beds,
        masterBeds: listing.masterBeds,
        maxAdults: listing.maxAdults,
        maxChildren: listing.maxChildren,
        maxInfants: listing.maxInfants,
        blockedDates: listing.blockedDates.map((b) => b.date.toISOString().slice(0, 10)),
        requiresApproval: listing.requiresApproval,
        requireGuidedSelfie: listing.requireGuidedSelfie,
        hasGatedCommunity: listing.hasGatedCommunity,
        hasOceanfront: listing.hasOceanfront,
        hasClifftop: listing.hasClifftop,
        hasJungleView: listing.hasJungleView,
        videoUrl: listing.videoUrl,
        tourUrl: listing.tourUrl,
        reviews: listing.reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          photos: r.photos,
          createdAt: r.createdAt,
          customer: r.customer,
        })),
      },
    })
  } catch (error) {
    console.error("Property listing GET error:", error)
    return NextResponse.json({ error: "Failed to fetch listing" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const existing = await prisma.propertyListing.findUnique({ where: { id: params.id } })
    const { ctx, denied } = await assertCanManagePropertyListings(user.id)
    if (denied || !ctx) {
      return NextResponse.json(listingsAccessDenied(), { status: 403 })
    }
    if (!existing || existing.vendorId !== ctx.hostVendorId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const {
      type,
      categorySlug,
      folderId,
      title,
      tagline,
      description,
      address,
      city,
      state,
      zip,
      country,
      latitude,
      longitude,
      hasGatedCommunity,
      hasOceanfront,
      hasClifftop,
      hasJungleView,
      amenities,
      images,
      videoUrl,
      tourUrl,
      nightlyRate,
      cleaningFee,
      securityDeposit,
      discountPercent,
      status,
      sqm,
      bedrooms,
      beds,
      masterBeds,
      maxAdults,
      maxChildren,
      maxInfants,
      blockedDates,
      wifiSsid,
      wifiPassword,
      gatePin,
      requireGuidedSelfie,
      guestTier,
      badge,
    } = body

    const data: Record<string, unknown> = {}
    if (type != null) data.type = mapPropertyTypeToEnum(type)
    if (categorySlug != null) data.categorySlug = categorySlug ? String(categorySlug).trim().toLowerCase() : null
    if (folderId !== undefined) data.folderId = folderId || null
    if (title != null) data.title = String(title).trim()
    if (tagline !== undefined) data.tagline = tagline || null
    if (description !== undefined) data.description = description || null
    if (address != null) data.address = String(address).trim()
    if (city != null) data.city = String(city).trim()
    if (state !== undefined) data.state = state || null
    if (zip !== undefined) data.zip = zip || null
    if (country !== undefined) data.country = country || existing.country
    if (latitude != null) data.latitude = Number(latitude)
    if (longitude != null) data.longitude = Number(longitude)
    if (hasGatedCommunity !== undefined) data.hasGatedCommunity = !!hasGatedCommunity
    if (hasOceanfront !== undefined) data.hasOceanfront = !!hasOceanfront
    if (hasClifftop !== undefined) data.hasClifftop = !!hasClifftop
    if (hasJungleView !== undefined) data.hasJungleView = !!hasJungleView
    if (amenities !== undefined) data.amenities = amenities || []
    if (images !== undefined) data.images = images || []
    if (videoUrl !== undefined) data.videoUrl = videoUrl || null
    if (tourUrl !== undefined) data.tourUrl = tourUrl || null
    if (nightlyRate != null) data.nightlyRate = Number(nightlyRate)
    if (cleaningFee != null) data.cleaningFee = Number(cleaningFee)
    if (securityDeposit != null) data.securityDeposit = Number(securityDeposit)
    if (discountPercent != null) data.discountPercent = Number(discountPercent)
    if (sqm != null) data.sqm = Number(sqm)
    if (bedrooms != null) data.bedrooms = Math.max(1, Number(bedrooms))
    if (beds != null) data.beds = Math.max(1, Number(beds))
    if (masterBeds != null) data.masterBeds = Math.max(0, Number(masterBeds))
    if (maxAdults != null) data.maxAdults = Math.max(1, Number(maxAdults))
    if (maxChildren != null) data.maxChildren = Math.max(0, Number(maxChildren))
    if (maxInfants != null) data.maxInfants = Math.max(0, Number(maxInfants))
    if (wifiSsid !== undefined) data.wifiSsid = wifiSsid ? String(wifiSsid).trim() : null
    if (wifiPassword !== undefined) data.wifiPassword = wifiPassword ? String(wifiPassword) : null
    if (gatePin !== undefined) data.gatePin = gatePin ? String(gatePin).trim() : null
    if (requireGuidedSelfie !== undefined) data.requireGuidedSelfie = !!requireGuidedSelfie
    if (badge !== undefined) data.badge = badge || null
    if (guestTier !== undefined && isValidPropertyGuestTier(guestTier)) {
      data.guestTier = normalizePropertyGuestTier(guestTier)
    }
    if (status != null) data.status = status === "DRAFT" ? "DRAFT" : status === "INACTIVE" ? "INACTIVE" : "ACTIVE"

    const listing = await prisma.propertyListing.update({
      where: { id: params.id },
      data,
    })

    if (Array.isArray(body.blockedDates)) {
      await prisma.propertyBlockedDate.deleteMany({ where: { listingId: params.id } })
      if (body.blockedDates.length > 0) {
        await prisma.propertyBlockedDate.createMany({
          data: body.blockedDates.map((d: string) => ({
            listingId: params.id,
            date: new Date(d),
          })),
          skipDuplicates: true,
        })
      }
    }

    return NextResponse.json({ success: true, listing })
  } catch (error) {
    console.error("Property listing PUT error:", error)
    return NextResponse.json({ error: "Failed to update listing" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const existing = await prisma.propertyListing.findUnique({ where: { id: params.id } })
    const { ctx, denied } = await assertCanManagePropertyListings(user.id)
    if (denied || !ctx) {
      return NextResponse.json(listingsAccessDenied(), { status: 403 })
    }
    if (!existing || existing.vendorId !== ctx.hostVendorId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.propertyListing.update({
      where: { id: params.id },
      data: { status: "INACTIVE" },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Property listing DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete listing" }, { status: 500 })
  }
}
