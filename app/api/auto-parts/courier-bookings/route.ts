import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')

    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 })
    }

    // Find courier booking by orderId
    const courierBooking = await prisma.courierBooking.findFirst({
      where: {
        orderId: orderId,
        customerId: user.id, // Ensure customer owns the order
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatar: true,
          },
        },
        rider: {
          select: {
            id: true,
            name: true,
            phone: true,
            riderProfile: {
              select: {
                vehicleType: true,
                vehicleBrand: true,
                vehicleModel: true,
                vehicleColor: true,
                licensePlate: true,
                rating: true,
                totalRides: true,
              },
            },
          },
        },
        rideType: {
          select: {
            id: true,
            name: true,
            basePrice: true,
            pricePerKm: true,
            pricePerMinute: true,
            icon: true,
            description: true,
          },
        },
        trackingUpdates: {
          orderBy: { timestamp: "desc" },
          take: 10,
        },
      },
    })

    if (!courierBooking) {
      return NextResponse.json({ 
        success: false,
        error: "Courier booking not found",
        booking: null
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      booking: courierBooking,
    })
  } catch (error) {
    console.error("Error fetching courier booking:", error)
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to fetch courier booking",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}

