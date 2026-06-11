import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { mapPropertyTypeToEnum } from "@/lib/property-types"
import { isValidPropertyGuestTier, normalizePropertyGuestTier } from "@/lib/property-guest-tier"
import { searchPropertyListings } from "@/lib/property-listing-search"
import {
  assertCanManagePropertyListings,
  listingsAccessDenied,
} from "@/lib/property-host-resolve"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const result = await searchPropertyListings({
      city: searchParams.get("city") || undefined,
      q: searchParams.get("q") || undefined,
      amenity: searchParams.get("amenity") || undefined,
      type: searchParams.get("type") || undefined,
      categorySlug: searchParams.get("categorySlug") || searchParams.get("category") || undefined,
      vendorId: searchParams.get("vendorId") || undefined,
      status: searchParams.get("status") || "ACTIVE",
      latitude: searchParams.get("lat")
        ? Number.parseFloat(searchParams.get("lat")!)
        : undefined,
      longitude: searchParams.get("lng")
        ? Number.parseFloat(searchParams.get("lng")!)
        : undefined,
      radiusKm: searchParams.get("radiusKm")
        ? Number.parseFloat(searchParams.get("radiusKm")!)
        : undefined,
      checkIn: searchParams.get("checkIn") || undefined,
      checkOut: searchParams.get("checkOut") || undefined,
      page: Number.parseInt(searchParams.get("page") || "1", 10),
      limit: Number.parseInt(searchParams.get("limit") || "30", 10),
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error("Property listings GET error:", error)
    return NextResponse.json({ error: "Failed to fetch listings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { ctx, denied } = await assertCanManagePropertyListings(user.id)
    if (denied || !ctx) {
      return NextResponse.json(listingsAccessDenied(), { status: 403 })
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
      badge,
      guestTier,
      sqm,
      bedrooms,
      beds,
      masterBeds,
      maxAdults,
      maxChildren,
      maxInfants,
      blockedDates,
      status,
      requiresApproval,
      aiGeneratedTitle,
      aiGeneratedDescription,
      aiGeneratedTagline,
      wifiSsid,
      wifiPassword,
      gatePin,
      requireGuidedSelfie,
    } = body

    const resolvedTitle = title || aiGeneratedTitle
    const resolvedCity = String(city || "").trim()
    const resolvedAddress = String(address || "").trim()

    if (
      !resolvedTitle ||
      !resolvedAddress ||
      !resolvedCity ||
      nightlyRate == null ||
      Number(nightlyRate) <= 0
    ) {
      return NextResponse.json(
        { error: "title, address, city, and a nightly rate greater than zero are required" },
        { status: 400 }
      )
    }

    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { error: "latitude and longitude are required — verify the address on the map" },
        { status: 400 }
      )
    }

    const listing = await prisma.propertyListing.create({
      data: {
        vendorId: ctx.hostVendorId,
        type: mapPropertyTypeToEnum(type || "Villa"),
        categorySlug: categorySlug ? String(categorySlug).trim().toLowerCase() : null,
        folderId: folderId || null,
        title: resolvedTitle,
        tagline: tagline || aiGeneratedTagline || null,
        description: description || aiGeneratedDescription || null,
        address: resolvedAddress,
        city: resolvedCity,
        state: state || null,
        zip: zip || null,
        country: country || "Pakistan",
        latitude: Number(latitude),
        longitude: Number(longitude),
        hasGatedCommunity: !!hasGatedCommunity,
        hasOceanfront: !!hasOceanfront,
        hasClifftop: !!hasClifftop,
        hasJungleView: !!hasJungleView,
        amenities: amenities || [],
        images: images || [],
        videoUrl: videoUrl || null,
        tourUrl: tourUrl || null,
        nightlyRate: Number(nightlyRate),
        cleaningFee: Number(cleaningFee || 0),
        securityDeposit: Number(securityDeposit || 0),
        discountPercent: Number(discountPercent || 0),
        badge: badge || null,
        guestTier: isValidPropertyGuestTier(guestTier)
          ? normalizePropertyGuestTier(guestTier)
          : "Standard",
        sqm: sqm != null ? Number(sqm) : null,
        bedrooms: bedrooms != null ? Math.max(1, Number(bedrooms)) : 1,
        beds: beds != null ? Math.max(1, Number(beds)) : 1,
        masterBeds: masterBeds != null ? Math.max(0, Number(masterBeds)) : 0,
        maxAdults: maxAdults != null ? Math.max(1, Number(maxAdults)) : 2,
        maxChildren: maxChildren != null ? Math.max(0, Number(maxChildren)) : 0,
        maxInfants: maxInfants != null ? Math.max(0, Number(maxInfants)) : 0,
        wifiSsid: wifiSsid ? String(wifiSsid).trim() : null,
        wifiPassword: wifiPassword ? String(wifiPassword) : null,
        gatePin: gatePin ? String(gatePin).trim() : null,
        requireGuidedSelfie: !!requireGuidedSelfie,
        status: status === "DRAFT" ? "DRAFT" : "ACTIVE",
        requiresApproval: requiresApproval !== false,
      },
    })

    if (Array.isArray(blockedDates) && blockedDates.length > 0) {
      await prisma.propertyBlockedDate.createMany({
        data: blockedDates.map((d: string) => ({
          listingId: listing.id,
          date: new Date(d),
        })),
        skipDuplicates: true,
      })
    }

    return NextResponse.json({ success: true, listing }, { status: 201 })
  } catch (error) {
    console.error("Property listing POST error:", error)
    return NextResponse.json({ error: "Failed to create listing" }, { status: 500 })
  }
}
