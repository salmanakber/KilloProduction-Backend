import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orderId = params.id

    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
        customerId: user.id,
      },
      include: {
        orderTracking: {
          orderBy: { timestamp: "asc" },
        },
      },
    })

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      )
    }

    // Find any courier booking linked to this order
    const courierBooking = await prisma.courierBooking.findFirst({
      where: {
        orderId,
      },
      include: {
        rider: {
          select: {
            id: true,
            name: true,
            phone: true,
            avatar: true,
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
        trackingUpdates: {
          orderBy: { timestamp: "desc" },
        },
      },
    })

    return NextResponse.json({
      success: true,
      order,
      courierBooking,
    })
  } catch (error) {
    console.error("Error fetching order tracking:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch order tracking",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

