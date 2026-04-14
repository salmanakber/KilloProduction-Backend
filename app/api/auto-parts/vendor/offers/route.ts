import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

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

    const where: any = {
      vendorId: user.id,
    }

    if (status) {
      where.status = status
    }

    const [offers, total] = await Promise.all([
      prisma.partOffer.findMany({
        where,
        include: {
          request: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                },
              },
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.partOffer.count({ where }),
    ])

    return NextResponse.json({
      offers: offers.map((offer) => ({
        id: offer.id,
        requestId: offer.requestId,
        request: {
          id: offer.request.id,
          partName: offer.request.partName,
          vehicleBrand: offer.request.vehicleBrand,
          vehicleModel: offer.request.vehicleModel,
          vehicleYear: offer.request.vehicleYear,
          customer: offer.request.user,
        },
        price: offer.price,
        condition: offer.condition,
        availability: offer.availability,
        description: offer.description,
        images: offer.images,
        warranty: offer.warranty,
        deliveryTime: offer.deliveryTime,
        status: offer.status,
        expiresAt: offer.expiresAt,
        createdAt: offer.createdAt,
        updatedAt: offer.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Offers fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch offers" }, { status: 500 })
  }
}


