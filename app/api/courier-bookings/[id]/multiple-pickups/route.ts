import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getPickupPointsForOrder } from "@/lib/multi-pickup-route-helper"

/**
 * GET /api/courier-bookings/[id]/multiple-pickups
 * Get all multiple pickup points for a courier booking
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const bookingId = params.id

    // Get the courier booking
    const courierBooking = await prisma.courierBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        orderId: true,
        customerId: true,
        riderId: true,
      },
    })

    if (!courierBooking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }

    // Verify user has access (customer or rider)
    if (courierBooking.customerId !== user.id && courierBooking.riderId !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    // Get multiple pickups for this booking
    const multiplePickups = await prisma.multiplePickup.findMany({
      where: {
        courierBookingId: bookingId,
      },
      orderBy: { sequence: 'asc' },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        groceryStore: {
          select: {
            id: true,
            storeName: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
      },
    })

    // If no multiple pickups found but orderId exists, try getting from order
    if (multiplePickups.length === 0 && courierBooking.orderId) {
      const pickups = await getPickupPointsForOrder(courierBooking.orderId)
      return NextResponse.json({
        success: true,
        pickups: pickups.map(p => ({
          id: p.id,
          sequence: p.sequence,
          storeName: p.storeName,
          address: p.address,
          latitude: p.latitude,
          longitude: p.longitude,
          status: p.status,
          pickedUpAt: p.pickedUpAt,
          distanceFromPrevious: p.distanceFromPrevious,
          durationFromPrevious: p.durationFromPrevious,
        })),
      })
    }

    return NextResponse.json({
      success: true,
      pickups: multiplePickups.map(p => ({
        id: p.id,
        sequence: p.sequence,
        storeName: p.storeName,
        address: p.storeAddress,
        latitude: p.storeLatitude,
        longitude: p.storeLongitude,
        status: p.status,
        pickedUpAt: p.pickedUpAt,
        distanceFromPrevious: p.distanceFromPrevious,
        durationFromPrevious: p.durationFromPrevious,
        module: p.module,
        restaurant: p.restaurant,
        groceryStore: p.groceryStore,
      })),
    })
  } catch (error) {
    console.error("Error fetching multiple pickups:", error)
    return NextResponse.json(
      { error: "Failed to fetch pickup points" },
      { status: 500 }
    )
  }
}
