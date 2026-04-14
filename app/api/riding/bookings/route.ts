import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { socketIOServer } from "@/lib/socket-server"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {}

    if (user.role === "CUSTOMER") {
      where.customerId = user.id
    } else if (user.role === "RIDER") {
      where.riderId = user.id
    }

    if (status) {
      // Handle comma-separated status values
      const statusArray = status.split(',').map(s => s.trim())
      if (statusArray.length > 1) {
        where.status = {
          in: statusArray
        }
      } else {
        where.status = statusArray[0]
      }
    }

    const [bookings, total] = await Promise.all([
      prisma.courierBooking.findMany({
        where,
        include: {
          customer: {
            select: {
              name: true,
              phone: true,
            },
          },
          rider: {
            select: {
              name: true,
              phone: true,
              id: true,
              riderProfile: {
                select: {
                  vehicleType: true,
                  licensePlate: true,
                  rating: true,
                },
              },
            },
          },
          rideType: {
            select: {
              id: true,
              name: true,
              icon: true,
              vehicleType: true,
            },
          },
          bids: {
            where: {
              status: {
                in: ['PENDING', 'ACCEPTED']
              }
            },
            include: {
              rider: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  riderProfile: {
                    select: {
                      vehicleType: true,
                      rating: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              createdAt: 'desc'
            },
          },
          trackingUpdates: {
            orderBy: { timestamp: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.courierBooking.count({ where }),
    ])

    return NextResponse.json({
      bookings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Courier bookings fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch courier bookings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()

    // Generate booking number
    const bookingNumber = `CB${Date.now()}${Math.floor(Math.random() * 1000)}`

    // Calculate distance and fare (mock calculation)
    const distance = calculateDistance(data.pickupLatitude, data.pickupLongitude, data.dropLatitude, data.dropLongitude)

    const baseFare = 3.0
    const farePerKm = 1.5
    const fare = baseFare + distance * farePerKm

    const booking = await prisma.courierBooking.create({
      data: {
        ...data,
        bookingNumber,
        customerId: user.id,
        distance,
        fare,
        estimatedTime: Math.ceil(distance * 3), // 3 minutes per km
      },
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
          },
        },
        trackingUpdates: true,
      },
    })

    // Create initial tracking update
    await prisma.courierTracking.create({
      data: {
        bookingId: booking.id,
        status: "REQUESTED",
        notes: "Booking created, looking for nearby riders",
      },
    })

    // Note: WebSocket notifications are now handled automatically by database change tracking middleware

    // TODO: Send confirmation to customer

    return NextResponse.json(booking, { status: 201 })
  } catch (error) {
    console.error("Courier booking creation error:", error)
    return NextResponse.json({ error: "Failed to create courier booking" }, { status: 500 })
  }
}

// Helper function to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Radius of the Earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c
  return Math.round(distance * 100) / 100 // Round to 2 decimal places
}
