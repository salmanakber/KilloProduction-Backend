import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      pickupAddress,
      dropAddress,
      rideType,
      packageType,
      packageWeight,
      isFragile,
      recipientName,
      recipientPhone,
      notes,
      scheduledAt,
    } = await request.json()

    if (!pickupAddress || !dropAddress || !rideType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Calculate fare
    const rideTypeData = await prisma.rideType.findUnique({
      where: { id: rideType },
    })

    if (!rideTypeData) {
      return NextResponse.json({ error: "Invalid ride type" }, { status: 400 })
    }

    const estimatedDistance = Math.random() * 20 + 2
    const estimatedFare = rideTypeData.basePrice + estimatedDistance * rideTypeData.pricePerKm

    // Create booking
    const booking = await prisma.rideBooking.create({
      data: {
        customerId: session.user.id,
        rideTypeId: rideType,
        pickupAddress,
        dropAddress,
        estimatedFare,
        estimatedDistance,
        packageType,
        packageWeight,
        isFragile,
        recipientName,
        recipientPhone,
        notes,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: "PENDING",
      },
      include: {
        rideType: true,
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    })

    return NextResponse.json({ booking })
  } catch (error) {
    console.error("Error creating booking:", error)
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 })
  }
}
