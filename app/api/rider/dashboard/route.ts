import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from '@/lib/auth'
import { rejectIfRiderCommissionLocked } from '@/lib/rider-app-access'
import { getRiderPayableCommissionSummary } from "@/lib/process-rider-payable-commission"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)

    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const riderLockResponse = rejectIfRiderCommissionLocked(session)
    if (riderLockResponse) return riderLockResponse

    const rider = await prisma.user.findUnique({
      where: { id: session.id },
      include: {
        riderProfile: true,
      },
    })

    if (!rider || rider.role !== "RIDER") {
      return NextResponse.json({ error: "Not a rider" }, { status: 403 })
    }

    // Time helpers
    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const startOfWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

    // Get all bookings with rideType to determine category
    const [allRideBookings, allCourierBookings] = await Promise.all([
      prisma.rideBooking.findMany({
        where: { riderId: session.id },
        include: { rideType: { select: { category: true } } },
      }),
      prisma.courierBooking.findMany({
        where: { riderId: session.id },
        include: { rideType: { select: { category: true } } },
      }),
    ])

    // Separate bookings by category (RIDE vs COURIER)
    const rideCategoryBookings = [
      ...allRideBookings.filter(b => b.rideType.category === "RIDE"),
      ...allCourierBookings.filter(b => b.rideType.category === "RIDE"),
    ]
    const courierCategoryBookings = [
      ...allRideBookings.filter(b => b.rideType.category === "COURIER"),
      ...allCourierBookings.filter(b => b.rideType.category === "COURIER"),
    ]

    // Calculate completion and cancellation rates based on rider's primary category
    // Check rider's vehicle type to determine primary category
    const riderVehicleType = rider.riderProfile?.vehicleType
    // For now, we'll calculate based on all bookings, but you can filter by vehicle type if needed
    const primaryBookings = rideCategoryBookings.length >= courierCategoryBookings.length 
      ? rideCategoryBookings 
      : courierCategoryBookings

    const completedBookings = primaryBookings.filter(b => 
      b.status === "COMPLETED" || b.status === "DELIVERED"
    ).length
    const cancelledBookings = primaryBookings.filter(b => 
      b.status === "CANCELLED"
    ).length
    const totalBookings = primaryBookings.length

    const completionRate = totalBookings > 0 
      ? (completedBookings / totalBookings) * 100 
      : 0
    const cancellationRate = totalBookings > 0 
      ? (cancelledBookings / totalBookings) * 100 
      : 0

    // Analytics queries
    const [
      todayRides,
      weekRides,
      monthRides,
      todayEarnings,
      weekEarnings,
      monthEarnings,
      todayNetEarnings,
      weekNetEarnings,
      monthNetEarnings,
      totalEarned,
      activeRides,
      pendingRides,
      recentRides,
      recentCourierBookings,
      totalRating,
      pendingCashout,
      activeBookings,
      reviews,
    ] = await Promise.all([
      // Ride counts (including both ride and courier bookings - ALL categories)
      Promise.all([
        prisma.rideBooking.count({
          where: { 
            riderId: session.id, 
            status: "COMPLETED", 
            completedAt: { gte: startOfDay },
          },
        }),
        prisma.courierBooking.count({
          where: { 
            riderId: session.id, 
            status: { in: ["DELIVERED", "COMPLETED"] }, 
            deliveredAt: { gte: startOfDay },
          },
        }),
      ]).then(([ride, courier]) => ride + courier),
      
      Promise.all([
        prisma.rideBooking.count({
          where: { 
            riderId: session.id, 
            status: "COMPLETED", 
            completedAt: { gte: startOfWeek },
          },
        }),
        prisma.courierBooking.count({
          where: { 
            riderId: session.id, 
            status: "DELIVERED", 
            deliveredAt: { gte: startOfWeek },
          },
        }),
      ]).then(([ride, courier]) => ride + courier),
      
      Promise.all([
        prisma.rideBooking.count({
          where: { 
            riderId: session.id, 
            status: "COMPLETED", 
            completedAt: { gte: startOfMonth },
          },
        }),
        prisma.courierBooking.count({
          where: { 
            riderId: session.id, 
            status: "DELIVERED", 
            deliveredAt: { gte: startOfMonth },
          },
        }),
      ]).then(([ride, courier]) => ride + courier),

      // Earnings (including both types - ALL categories)
      Promise.all([
        prisma.rideBooking.aggregate({
          where: { 
            riderId: session.id, 
            status: "COMPLETED", 
            completedAt: { gte: startOfDay },
          },
          _sum: { finalFare: true },
        }),
        prisma.courierBooking.aggregate({
          where: { 
            riderId: session.id, 
            status: "DELIVERED", 
            deliveredAt: { gte: startOfDay },
          },
          _sum: { fare: true },
        }),
      ]).then(([ride, courier]) => (ride._sum.finalFare || 0) + (courier._sum.fare || 0)),
      
      Promise.all([
        prisma.rideBooking.aggregate({
          where: { 
            riderId: session.id, 
            status: "COMPLETED", 
            completedAt: { gte: startOfWeek },
          },
          _sum: { finalFare: true },
        }),
        prisma.courierBooking.aggregate({
          where: { 
            riderId: session.id, 
            status: "DELIVERED", 
            deliveredAt: { gte: startOfWeek },
          },
          _sum: { fare: true },
        }),
      ]).then(([ride, courier]) => (ride._sum.finalFare || 0) + (courier._sum.fare || 0)),
      
      Promise.all([
        prisma.rideBooking.aggregate({
          where: { 
            riderId: session.id, 
            status: "COMPLETED", 
            completedAt: { gte: startOfMonth },
          },
          _sum: { finalFare: true },
        }),
        prisma.courierBooking.aggregate({
          where: { 
            riderId: session.id, 
            status: "DELIVERED", 
            deliveredAt: { gte: startOfMonth },
          },
          _sum: { fare: true },
        }),
      ]).then(([ride, courier]) => (ride._sum.finalFare || 0) + (courier._sum.fare || 0)),

      // Net Earnings from RiderEarning model (after commission)
      prisma.riderEarning.aggregate({
        where: {
          status: "PAID",
          riderId: session.id,
          createdAt: { gte: startOfDay },
        },
        _sum: { netAmount: true },
      }).then(result => result?._sum?.netAmount || 0),

      prisma.riderEarning.aggregate({
        where: {
          status: "PAID",
          riderId: session.id,
          createdAt: { gte: startOfWeek },
        },
        _sum: { netAmount: true },
      }).then(result => result._sum.netAmount || 0),

      prisma.riderEarning.aggregate({
        where: {
          status: "PAID",
          riderId: session.id,
          createdAt: { gte: startOfMonth },
        },
        _sum: { netAmount: true },
      }).then(result => result?._sum?.netAmount || 0),

      // Total earned (all time from RiderEarning)
      prisma.riderEarning.aggregate({
        where: {
          riderId: session.id,
          status: "PAID",
        },
        _sum: { netAmount: true },
      }).then(result => result._sum.netAmount || 0),

      // Status counts
      Promise.all([
        prisma.rideBooking.count({
          where: {
            riderId: session.id,
            status: {
              in: [
                "RIDER_ASSIGNED",
                "ACCEPTED",
                "PICKED_UP",
                "IN_TRANSIT",
                "ARRIVED_AT_PICKUP",
                "ARRIVED_AT_DROPOFF",
                "EN_ROUTE_TO_PICKUP",
                "EN_ROUTE_TO_DROPOFF",
              ],
            },
          },
        }),
        prisma.courierBooking.count({
          where: {
            riderId: session.id,
            status: {
              in: [
                "RIDER_ASSIGNED",
                "ACCEPTED",
                "PICKED_UP",
                "IN_TRANSIT",
                "ARRIVED_AT_PICKUP",
                "ARRIVED_AT_DROPOFF",
                "EN_ROUTE_TO_PICKUP",
                "EN_ROUTE_TO_DROPOFF",
              ],
            },
          },
        }),
      ]).then(([ride, courier]) => ride + courier),
      
      Promise.all([
        prisma.rideBooking.count({
          where: { riderId: null, status: { in: ["REQUESTED", "BIDDING"] } },
        }),
        prisma.courierBooking.count({
          where: { riderId: null, status: { in: ["REQUESTED", "BIDDING"] } },
        }),
      ]).then(([ride, courier]) => ride + courier),

      // Recent rides (RIDE category)
      prisma.rideBooking.findMany({
        where: { 
          riderId: session.id,
          rideType: { category: "RIDE" },
        },
        include: { 
          customer: { select: { name: true, phone: true } },
          rideType: { select: { category: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),

      // Recent courier bookings (COURIER category)
      prisma.courierBooking.findMany({
        where: { 
          riderId: session.id,
          rideType: { category: "COURIER" },
        },
        include: { 
          customer: { select: { name: true, phone: true } },
          rideType: { select: { category: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),

      // Average rating from Review model
      prisma.review.aggregate({
        where: { 
          riderId: rider.riderProfile?.id || '',
          targetType: 'RIDER',
        },
        _avg: { rating: true },
        _count: { rating: true },
      }).then(result => result._avg.rating || 0),

      // Pending cashouts
      prisma.riderCashout.aggregate({
        where: { riderId: session.id, status: { in: ["PENDING", "PROCESSING"] } },
        _sum: { amount: true },
      }),

      // Active bookings (rides + courier)
      Promise.all([
        prisma.rideBooking.findMany({
          where: {
            riderId: session.id,
            status: {
              in: [
                "RIDER_ASSIGNED",
                "ACCEPTED",
                "PICKED_UP",
                "IN_TRANSIT",
                "ARRIVED_AT_PICKUP",
                "ARRIVED_AT_DROPOFF",
                "EN_ROUTE_TO_PICKUP",
                "EN_ROUTE_TO_DROPOFF",
              ],
            },
          },
          include: { 
            customer: { select: { id: true, name: true, phone: true, avatar: true } },
            rideType: { select: { category: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.courierBooking.findMany({
          where: {
            riderId: session.id,
            status: {
              in: [
                "RIDER_ASSIGNED",
                "ACCEPTED",
                "PICKED_UP",
                "IN_TRANSIT",
                "ARRIVED_AT_PICKUP",
                "ARRIVED_AT_DROPOFF",
                "EN_ROUTE_TO_PICKUP",
                "EN_ROUTE_TO_DROPOFF",
              ],
            },
          },
          include: { 
            customer: { select: { id: true, name: true, phone: true, avatar: true } },
            rideType: { select: { category: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]).then(([rideBookings, courierBookings]) => {
        const formattedRide = rideBookings.map(b => ({
          id: b.id,
          type: b.rideType.category === "RIDE" ? "ride" as const : "courier" as const,
          status: b.status,
          bookingNumber: b.bookingNumber,
          pickupAddress: b.pickupAddress,
          dropAddress: b.dropAddress,
          pickupLatitude: b.pickupLatitude,
          pickupLongitude: b.pickupLongitude,
          dropLatitude: b.dropLatitude,
          dropLongitude: b.dropLongitude,
          distance: b.distance,
          estimatedFare: b.estimatedFare,
          finalFare: b.finalFare || b.estimatedFare,
          fare: b.finalFare || b.estimatedFare,
          paymentStatus: (b as any).paymentStatus || 'PENDING',
          paymentMethod: (b as any).paymentMethod || null,
          customer: b.customer,
          createdAt: b.createdAt.toISOString(),
        }))
        const formattedCourier = courierBookings.map(b => ({
          id: b.id,
          type: b.rideType.category === "COURIER" ? "courier" as const : "ride" as const,
          status: b.status,
          bookingNumber: b.bookingNumber,
          pickupAddress: b.pickupAddress,
          dropAddress: b.dropAddress,
          pickupLatitude: b.pickupLatitude,
          pickupLongitude: b.pickupLongitude,
          dropLatitude: b.dropLatitude,
          dropLongitude: b.dropLongitude,
          distance: b.distance,
          estimatedFare: b.fare,
          finalFare: b.fare,
          fare: b.fare,
          paymentStatus: (b as any).paymentStatus || 'PENDING',
          paymentMethod: (b as any).paymentMethod || null,
          customer: b.customer,
          createdAt: b.createdAt.toISOString(),
        }))
        return [...formattedRide, ...formattedCourier].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      }),

      // Get reviews for the rider
      prisma.review.findMany({
        where: { 
          riderId: rider.riderProfile?.id,
          targetType: 'RIDER',
        },
        include: {
          target: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ])
    

    // 🟩 Calculate online status
    let isOnline = false
    if (rider?.riderProfile?.isOnline) {
      const lastOnline = new Date(rider.riderProfile.isOnline)
      const diffMins = (Date.now() - lastOnline.getTime()) / 60000
      isOnline = diffMins < 5 // consider online if active within last 5 mins
    }

    // 🕓 Get today's online logs and total time
    const sessions = await prisma.riderOnlineSession.findMany({
      where: {
        riderId: rider.riderProfile?.id || '',
        startTime: { gte: startOfDay },
      },
      orderBy: { startTime: "desc" },
    })

    let totalMs = 0
    const now = new Date()

    for (const session of sessions) {
      const end = session.endTime ? new Date(session.endTime) : now
      totalMs += end.getTime() - new Date(session.startTime).getTime()
    }

    const onlineHours = Math.floor(totalMs / (1000 * 60 * 60))
    const onlineMinutes = Math.floor((totalMs / (1000 * 60)) % 60)

    // Combine recent rides and courier bookings
    const allRecentRides = [
      ...recentRides.map(r => ({
        id: r.id,
        bookingNumber: r.bookingNumber,
        status: r.status,
        pickupAddress: r.pickupAddress,
        dropAddress: r.dropAddress,
        pickupLatitude: r.pickupLatitude,
        pickupLongitude: r.pickupLongitude,
        dropLatitude: r.dropLatitude,
        dropLongitude: r.dropLongitude,
        distance: r.distance,
        estimatedFare: r.estimatedFare,
        finalFare: r.finalFare,
        fare: r.finalFare || r.estimatedFare,
        customer: r.customer,
        type: 'ride' as const,
        createdAt: r.createdAt.toISOString(),
      })),
      ...recentCourierBookings.map(c => ({
        id: c.id,
        bookingNumber: c.bookingNumber,
        status: c.status,
        pickupAddress: c.pickupAddress,
        dropAddress: c.dropAddress,
        pickupLatitude: c.pickupLatitude,
        pickupLongitude: c.pickupLongitude,
        dropLatitude: c.dropLatitude,
        dropLongitude: c.dropLongitude,
        distance: c.distance,
        estimatedFare: c.fare,
        finalFare: c.fare,
        fare: c.fare,
        customer: c.customer,
        type: 'courier' as const,
        createdAt: c.createdAt.toISOString(),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const recentRideIds = allRecentRides.filter((r) => r.type === "ride").map((r) => r.id)
    const recentCourierIds = allRecentRides.filter((r) => r.type === "courier").map((r) => r.id)
    const recentEarningOr: Array<{ rideBookingId?: { in: string[] }; orderId?: { in: string[] } }> = []
    if (recentRideIds.length) recentEarningOr.push({ rideBookingId: { in: recentRideIds } })
    if (recentCourierIds.length) recentEarningOr.push({ orderId: { in: recentCourierIds } })
    const recentRiderEarnings =
      recentEarningOr.length > 0
        ? await prisma.riderEarning.findMany({
            where: { riderId: session.id, OR: recentEarningOr },
            select: { rideBookingId: true, orderId: true, netAmount: true },
          })
        : []
    const netPayoutByRecentId = new Map<string, number>()
    for (const e of recentRiderEarnings) {
      const key = e.rideBookingId || e.orderId
      if (key && e.netAmount != null && Number.isFinite(e.netAmount)) {
        netPayoutByRecentId.set(key, e.netAmount)
      }
    }
    const allRecentRidesWithNet = allRecentRides.map((r) => ({
      ...r,
      netPayout: netPayoutByRecentId.get(r.id),
    }))

    const analytics = {
      todayRides,
      weekRides,
      monthRides,
      todayEarnings,
      weekEarnings,
      monthEarnings,
      todayNetEarnings, // Net amount after commission from RiderEarning
      weekNetEarnings,  // Net amount after commission from RiderEarning
      monthNetEarnings, // Net amount after commission from RiderEarning
      totalEarned,      // Total earned all time from RiderEarning
      activeRides,
      pendingRides,
      averageRating: totalRating || 0,
      onlineHours,
      onlineMinutes,
      completionRate,
      cancellationRate,
    }

    const payableCommission = await getRiderPayableCommissionSummary(session.id)

    return NextResponse.json({
      rider: {
        ...rider,
        riderProfile: {
          ...rider.riderProfile,
          completionRate,
          cancellationRate,
        },
      },
      analytics,
      recentRides: allRecentRidesWithNet,
      activeBookings,
      pendingCashout: pendingCashout._sum.amount || 0,
      isOnline,
      onlineSessions: sessions,
      reviews: reviews.map(r => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        customer: r.target,
      })),
      payableCommission,
    })
  } catch (error) {
    console.error("Error fetching rider dashboard:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
