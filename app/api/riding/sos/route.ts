import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getSocketServer } from "@/lib/socket-init"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { bookingId, customerId, riderId, latitude, longitude, timestamp, message } = body

    if (!bookingId || !customerId || !latitude || !longitude) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Verify the booking exists and belongs to the customer (check both RideBooking and CourierBooking)
    const [rideBooking, courierBooking] = await Promise.all([
      prisma.rideBooking.findFirst({
        where: {
          id: bookingId,
          customerId: user.id,
          status: {
            in: ['ACCEPTED', 'RIDER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_PICKUP', 'ARRIVED_AT_DROPOFF', 'EN_ROUTE_TO_PICKUP', 'EN_ROUTE_TO_DROPOFF']
          }
        },
        include: {
          rider: {
            include: {
              user: true
            }
          },
          customer: {
            include: {
              userProfile: true
            }
          }
        }
      }),
      prisma.courierBooking.findFirst({
        where: {
          id: bookingId,
          customerId: user.id,
          status: {
            in: ['ACCEPTED', 'RIDER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_PICKUP', 'ARRIVED_AT_DROPOFF', 'EN_ROUTE_TO_PICKUP', 'EN_ROUTE_TO_DROPOFF']
          }
        },
        include: {
          rider: {
            include: {
              user: true
            }
          },
          customer: {
            include: {
              userProfile: true
            }
          }
        }
      })
    ])

    const booking = rideBooking || courierBooking

    if (!booking) {
      return NextResponse.json({ error: "No active booking found" }, { status: 404 })
    }

    // Create SOS record
    const sosRecord = await prisma.sOSAlert.create({
      data: {
        bookingId: booking.id,
        bookingType: rideBooking ? 'RIDE' : 'COURIER',
        customerId: user.id,
        riderId: booking.riderId,
        latitude: latitude,
        longitude: longitude,
        message: message || 'SOS Alert - Customer needs immediate assistance',
        status: 'ACTIVE',
        timestamp: new Date(timestamp || new Date().toISOString())
      }
    })

    const socketServer = getSocketServer()

    // Send notification to rider if available
    if (booking.riderId && booking.rider) {
      await socketServer.sendNotificationToUser(booking.rider.user.id, {
        userId: booking.rider.user.id,
        title: "🚨 SOS Alert",
        message: `Customer ${booking.customer.userProfile?.firstName || 'Unknown'} has triggered an emergency alert. Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        type: "EMERGENCY",
        module: "RIDING",
        data: {
          sosId: sosRecord.id,
          bookingId: booking.id,
          customerId: user.id,
          latitude,
          longitude,
          timestamp: sosRecord.timestamp
        },
        actionUrl: `/rider/sos/${sosRecord.id}`,
      })
    }

    // Send notification to admin/emergency services
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, name: true }
    })

    for (const admin of admins) {
      await socketServer.sendNotificationToUser(admin.id, {
        userId: admin.id,
        title: "🚨 Emergency SOS Alert",
        message: `Customer ${booking.customer.userProfile?.firstName || 'Unknown'} has triggered an emergency alert during ride #${booking.bookingNumber}`,
        type: "EMERGENCY",
        module: "ADMIN",
        data: {
          sosId: sosRecord.id,
          bookingId: booking.id,
          customerId: user.id,
          riderId: booking.riderId,
          latitude,
          longitude,
          timestamp: sosRecord.timestamp
        },
        actionUrl: `/admin/sos/${sosRecord.id}`,
      })
    }

    return NextResponse.json({
      success: true,
      message: "SOS alert sent successfully",
      data: {
        sosId: sosRecord.id,
        timestamp: sosRecord.timestamp,
        riderNotified: !!booking.riderId,
        adminNotified: admins.length
      }
    })

  } catch (error) {
    console.error("SOS alert error:", error)
    return NextResponse.json({ error: "Failed to send SOS alert" }, { status: 500 })
  }
}
