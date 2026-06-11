import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { formatPropertyListingCard } from "@/lib/property-types"

export async function GET(
  _request: NextRequest,
  { params }: { params: { vendorId: string } }
) {
  try {
    const vendor = await prisma.user.findUnique({
      where: { id: params.vendorId },
      select: {
        id: true,
        name: true,
        avatar: true,
        email: true,
        phone: true,
        isVerified: true,
        lastLoginAt: true,
        vendorProfile: true,
        createdAt: true,
      },
    })
    if (!vendor) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 })
    }

    const listings = await prisma.propertyListing.findMany({
      where: { vendorId: params.vendorId, status: "ACTIVE" },
      include: { vendor: { select: { id: true, name: true, avatar: true } } },
    })

    const reviewAgg = await prisma.propertyReview.aggregate({
      where: { listing: { vendorId: params.vendorId } },
      _avg: { rating: true },
      _count: true,
    })

    const recentReviews = await prisma.propertyReview.findMany({
      where: { listing: { vendorId: params.vendorId } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        customer: { select: { id: true, name: true, avatar: true } },
        listing: { select: { title: true } },
      },
    })

    const portfolioImages = listings
      .map((l) => {
        const imgs = Array.isArray(l.images) ? (l.images as string[]) : []
        return imgs[0] || null
      })
      .filter(Boolean)
      .slice(0, 5) as string[]

    const associatedMembers = [
      {
        id: vendor.id,
        name: vendor.name || vendor.vendorProfile?.businessName || "Host",
        avatar: vendor.avatar,
        role: "Primary host",
      },
    ]

    const avgRating = reviewAgg._avg.rating || 0
    const verifiedBadges: { id: string; label: string; icon: string; verified: boolean }[] = [
      {
        id: "identity",
        label: "Government ID",
        icon: "card-account-details-outline",
        verified: vendor.isVerified,
      },
      {
        id: "email",
        label: "Email confirmed",
        icon: "email-check-outline",
        verified: !!vendor.email,
      },
      {
        id: "phone",
        label: "Phone confirmed",
        icon: "phone-check-outline",
        verified: !!vendor.phone,
      },
      {
        id: "license",
        label: "Business license",
        icon: "file-certificate-outline",
        verified: !!vendor.vendorProfile?.businessLicense,
      },
      {
        id: "superhost",
        label: "Top-rated host",
        icon: "shield-star-outline",
        verified: avgRating >= 4.7 && reviewAgg._count >= 5,
      },
      {
        id: "listings",
        label: "Active listings",
        icon: "home-city-outline",
        verified: listings.length > 0,
      },
    ]

    return NextResponse.json({
      success: true,
      host: {
        id: vendor.id,
        name: vendor.name,
        avatar: vendor.avatar,
        associatedMembers,
        portfolioImages,
        coverImage:
          vendor.vendorProfile?.coverImage ||
          (Array.isArray(listings[0]?.images) ? (listings[0].images as string[])[0] : null),
        businessName: vendor.vendorProfile?.businessName,
        bio: vendor.vendorProfile?.description,
        description: vendor.vendorProfile?.description,
        city: vendor.vendorProfile?.city,
        memberSince: vendor.createdAt,
        joinedDate: vendor.createdAt,
        rating: reviewAgg._avg.rating || 0,
        reviewsCount: reviewAgg._count,
        responseTime: "< 15 min",
        responseRate: "100%",
        properties: listings.map(formatPropertyListingCard),
        verifiedBadges,
        verifications: verifiedBadges,
        reviews: recentReviews.map((r) => ({
          id: r.id,
          author: r.customer.name || "Guest",
          avatar: r.customer.avatar,
          rating: r.rating,
          date: r.createdAt.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
          comment: r.comment,
          verified: true,
          listingTitle: r.listing.title,
        })),
      },
    })
  } catch (error) {
    console.error("Property host GET error:", error)
    return NextResponse.json({ error: "Failed to fetch host" }, { status: 500 })
  }
}
