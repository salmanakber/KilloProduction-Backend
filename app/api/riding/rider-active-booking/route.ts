import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getCustomerRating, getCustomerRideHistory } from "@/lib/customer-rider-context"
import { CourierStatus, RideStatus } from "@prisma/client"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get rider profile
    const riderProfile = await prisma.riderProfile.findUnique({
      where: { userId: user.id },
    })

    if (!riderProfile) {
      return NextResponse.json({ error: "Rider profile not found" }, { status: 404 })
    }
    

    // Active statuses for bookings
    const activeStatuses: CourierStatus[] = [
      'RIDER_ASSIGNED',
      'ACCEPTED',
      'PICKED_UP',
      'IN_TRANSIT',
      'ARRIVED_AT_PICKUP',
      'ARRIVED_AT_DROPOFF',
      'EN_ROUTE_TO_PICKUP',
      'EN_ROUTE_TO_DROPOFF',
    ] as CourierStatus[]

    // Check for active courier booking
    const activeCourierBooking = await prisma.courierBooking.findFirst({
      where: {
        riderId: riderProfile.userId,
        status: { in: activeStatuses as CourierStatus[] },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatar: true,
            reviews: true,
          },

        },
        supplierOrders: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            pharmacy: {
              select: {
                id: true,
                pharmacyName: true,
                userId: true,
              }
            },
            wholesaler: {
              select: {
                id: true,
                companyName: true,
                userId: true,
              }
            }
          }
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    

    // Check for active ride booking
    const activeRideBooking = await prisma.rideBooking.findFirst({
      where: {
        riderId: riderProfile.userId,
        status: { in: activeStatuses as RideStatus[] },
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
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Return the active booking (prioritize courier if both exist)
    const activeBooking = activeCourierBooking || activeRideBooking

    

    if (!activeBooking) {
      return NextResponse.json({ 
        success: true,
        hasActiveBooking: false,
        data: null 
      })
    }

    // Format the booking response
    // For WHOLESALER module, use supplier order customer info if available
    let customerData = activeCourierBooking?.customer || (activeRideBooking as any)?.customer
    if (activeCourierBooking?.module === 'WHOLESALER' && activeCourierBooking.supplierOrders && activeCourierBooking.supplierOrders.length > 0) {
      // Use pharmacy as customer for supplier orders
      const supplierOrder = activeCourierBooking.supplierOrders[0]
      if (supplierOrder.pharmacy) {
        // Get pharmacy user details
        const pharmacyUser = await prisma.user.findUnique({
          where: { id: supplierOrder.pharmacy.userId },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatar: true,
          }
        })
        if (pharmacyUser) {
          customerData = {
            ...pharmacyUser,
            name: supplierOrder.pharmacy.pharmacyName || pharmacyUser.name,
          }
        }
      }
    }

    const sourceCustomerId =
      activeCourierBooking?.customerId ?? activeRideBooking?.customerId ?? null

    let customerRatingPayload: Awaited<ReturnType<typeof getCustomerRating>> | null = null
    let customerRideHistoryPayload: Awaited<ReturnType<typeof getCustomerRideHistory>> | null = null
    if (sourceCustomerId) {
      ;[customerRatingPayload, customerRideHistoryPayload] = await Promise.all([
        getCustomerRating(sourceCustomerId),
        getCustomerRideHistory(sourceCustomerId, 30),
      ])
    }

    const bookingData = {
      id: activeBooking.id,
      type: activeCourierBooking ? 'courier' : 'ride',
      bookingNumber: activeCourierBooking?.bookingNumber || (activeBooking as any).bookingNumber,
      status: activeBooking.status,
      pickupAddress: activeCourierBooking?.pickupAddress || (activeBooking as any).pickupAddress,
      dropAddress: activeCourierBooking?.dropAddress || (activeBooking as any).dropAddress,
      pickupLatitude: activeCourierBooking?.pickupLatitude || (activeBooking as any).pickupLatitude,
      pickupLongitude: activeCourierBooking?.pickupLongitude || (activeBooking as any).pickupLongitude,
      dropLatitude: activeCourierBooking?.dropLatitude || (activeBooking as any).dropLatitude,
      dropLongitude: activeCourierBooking?.dropLongitude || (activeBooking as any).dropLongitude,
      distance: activeCourierBooking?.distance || (activeBooking as any).distance,
      estimatedFare: activeCourierBooking?.fare || (activeBooking as any).fare,
      finalFare: activeCourierBooking?.fare || (activeBooking as any).fare,
      fare: activeCourierBooking?.fare || (activeBooking as any).fare,
      estimatedTime: activeCourierBooking?.estimatedTime || (activeBooking as any).estimatedTime,
      customer: customerData
        ? {
            ...customerData,
            customerRating: customerRatingPayload,
            rideHistory: customerRideHistoryPayload?.rides ?? [],
            ridesTotalCount: customerRideHistoryPayload?.totalCount ?? 0,
          }
        : customerData,
      customerRating: customerRatingPayload,
      customerRides: customerRideHistoryPayload?.rides ?? [],
      ridesTotalCount: customerRideHistoryPayload?.totalCount ?? 0,
      module: activeCourierBooking?.module || 'RIDING',
      orderId: activeCourierBooking?.orderId || null, // Keep for backward compatibility
      supplierOrderId: activeCourierBooking?.module === 'WHOLESALER' && activeCourierBooking.supplierOrders && activeCourierBooking.supplierOrders.length > 0 
        ? activeCourierBooking.supplierOrders[0].id 
        : null,
      createdAt: activeBooking.createdAt,
      updatedAt: activeBooking.updatedAt,
    }

    return NextResponse.json({
      success: true,
      hasActiveBooking: true,
      data: bookingData,
    })
  } catch (error: unknown) {
    console.error("Error fetching rider active booking:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch active booking" },
      { status: 500 }
    )
  }
}
