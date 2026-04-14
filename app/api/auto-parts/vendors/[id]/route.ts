import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const vendor = await prisma.user.findUnique({
      where: {
        id: params.id,
        role: {
          in: ["VENDOR", "MECHANIC"],
        },
      },
      include: {
        vendorProfile: {
          select: {
            businessName: true,
            businessType: true,
            description: true,
            logo: true,
            coverImage: true,
            address: true,
            city: true,
            state: true,
            latitude: true,
            longitude: true,
            website: true,
          },
        },
        _count: {
          select: {
            vendorProducts: {
              where: {
                type: "AUTO_PART",
                isActive: true,
              },
            },
            receivedReviews: {
              where: {
                targetType: "VENDOR",
              },
            },
          },
        },
      },
    })

    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 })
    }

    // Calculate average rating from reviews
    const reviews = await prisma.review.findMany({
      where: {
        targetId: vendor.id,
        targetType: "VENDOR",
      },
      select: {
        rating: true,
      },
    })

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0

    const vendorData = {
      id: vendor.id,
      name: vendor.name,
      email: vendor.email,
      phone: vendor.phone,
      avatar: vendor.avatar,
      isVerified: vendor.isVerified,
      businessName: vendor.vendorProfile?.businessName || vendor.name,
      businessType: vendor.vendorProfile?.businessType,
      description: vendor.vendorProfile?.description,
      logo: vendor.vendorProfile?.logo || vendor.avatar,
      coverImage: vendor.vendorProfile?.coverImage,
      address: vendor.vendorProfile?.address,
      city: vendor.vendorProfile?.city,
      state: vendor.vendorProfile?.state,
      latitude: vendor.vendorProfile?.latitude,
      longitude: vendor.vendorProfile?.longitude,
      website: vendor.vendorProfile?.website,
      rating: avgRating,
      totalReviews: reviews.length,
      totalProducts: vendor._count.vendorProducts,
      isOnline: false, // You can implement online status tracking if needed
    }

    return NextResponse.json({ vendor: vendorData })
  } catch (error) {
    console.error("Vendor fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch vendor" }, { status: 500 })
  }
}

