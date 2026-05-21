import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getSocketServer } from "@/lib/socket-init"
import { NotificationBridge } from "@/lib/notification-bridge"

const activeBookingInclude = {
  rider: {
    select: {
      id: true,
      name: true,
      phone: true,
      userProfile: { select: { firstName: true, lastName: true } },
    },
  },
  customer: {
    select: {
      id: true,
      name: true,
      userProfile: { select: { firstName: true, lastName: true } },
    },
  },
} as const

function customerDisplayName(customer: {
  name?: string | null
  userProfile?: { firstName?: string | null } | null
}): string {
  return customer.userProfile?.firstName || customer.name || "Unknown"
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { bookingId, latitude, longitude, timestamp, message } = body

    if (!bookingId || typeof latitude !== "number" || typeof longitude !== "number") {
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
        include: activeBookingInclude,
      }),
      prisma.courierBooking.findFirst({
        where: {
          id: bookingId,
          customerId: user.id,
          status: {
            in: ['ACCEPTED', 'RIDER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_PICKUP', 'ARRIVED_AT_DROPOFF', 'EN_ROUTE_TO_PICKUP', 'EN_ROUTE_TO_DROPOFF']
          }
        },
        include: activeBookingInclude,
      })
    ])

    const booking = rideBooking || courierBooking

    if (!booking) {
      return NextResponse.json({ error: "No active booking found" }, { status: 404 })
    }

    const existingActive = await prisma.sOSAlert.findFirst({
      where: {
        bookingId: booking.id,
        customerId: user.id,
        status: "ACTIVE",
        timestamp: {
          gte: new Date(Date.now() - 30 * 1000),
        },
      },
      select: { id: true, timestamp: true },
      orderBy: { timestamp: "desc" },
    })
    if (existingActive) {
      return NextResponse.json({
        success: true,
        message: "SOS alert already active",
        data: { sosId: existingActive.id, timestamp: existingActive.timestamp },
      })
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
        message: String(message || 'SOS Alert - Customer needs immediate assistance').slice(0, 500),
        status: 'ACTIVE',
        timestamp: new Date(timestamp || new Date().toISOString())
      }
    })

    const socketServer = getSocketServer()

    const customerName = customerDisplayName(booking.customer)

    // Send notification to rider if available
    if (booking.riderId && booking.rider) {
      await socketServer.sendNotificationToUser(booking.rider.id, {
        userId: booking.rider.id,
        title: "🚨 SOS Alert",
        message: `Customer ${customerName} has triggered an emergency alert. Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
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
      await NotificationBridge.sendNotification({
        userId: booking.rider.id,
        title: "Emergency SOS",
        message: `Customer triggered SOS for booking #${booking.bookingNumber}. Please respond immediately.`,
        type: "SYSTEM",
        module: "RIDING",
        actionUrl: `/rider/sos/${sosRecord.id}`,
        data: { sosId: sosRecord.id, bookingId: booking.id, latitude, longitude, timestamp: sosRecord.timestamp },
      })
    }

    // Send notification to admin/emergency services
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, name: true }
    })

    try {
      getSocketServer().emitAdminBookingsMonitor("admin_sos_alert", {
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        sosId: sosRecord.id,
        customerId: user.id,
        riderId: booking.riderId,
        latitude,
        longitude,
        timestamp: sosRecord.timestamp.toISOString(),
      })
    } catch (socketErr) {
      console.error("SOS admin socket broadcast failed:", socketErr)
    }

    for (const admin of admins) {
      await socketServer.sendNotificationToUser(admin.id, {
        userId: admin.id,
        title: "🚨 Emergency SOS Alert",
        message: `Customer ${customerName} has triggered an emergency alert during ride #${booking.bookingNumber}`,
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
      await NotificationBridge.sendNotification({
        userId: admin.id,
        title: "Emergency SOS Alert",
        message: `SOS triggered on booking #${booking.bookingNumber}. Immediate review required.`,
        type: "SYSTEM",
        module: "ADMIN",
        actionUrl: `/admin/sos/${sosRecord.id}`,
        data: { sosId: sosRecord.id, bookingId: booking.id, customerId: user.id, riderId: booking.riderId, latitude, longitude, timestamp: sosRecord.timestamp },
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
