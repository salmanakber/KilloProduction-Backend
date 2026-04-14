import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { enrichOffersWithLinkedProducts } from "@/lib/enrich-part-offers-products"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const requestId = searchParams.get("requestId")

    if (!requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 })
    }

    // Get vendor's existing offer for this request
    const offer = await prisma.partOffer.findFirst({
      where: {
        requestId,
        vendorId: user.id,
      },
      include: {
        request: {
          select: {
            id: true,
            partName: true,
            vehicleBrand: true,
            vehicleModel: true,
            vehicleYear: true,
            urgency: true,
            maxBudget: true,
            status: true,
          },
        },
        vendor: {
          select: {
            name: true,
            vendorProfile: {
              select: {
                businessName: true,
                logo: true,
              },
            },
          },
        },
        mechanic: {
          select: {
            id: true,
            name: true,
            mechanicProfile: {
              select: {
                businessName: true,
                logo: true,
                rating: true,
                totalReviews: true,
                hourlyRate: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    if (!offer) {
      return NextResponse.json({ offer: null })
    }

    const [withProduct] = await enrichOffersWithLinkedProducts([offer])
    return NextResponse.json({ offer: withProduct })
  } catch (error) {
    console.error("Get my offer error:", error)
    return NextResponse.json({ error: "Failed to fetch offer" }, { status: 500 })
  }
}

