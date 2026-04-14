import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "MECHANIC") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get mechanic profile
    const mechanicProfile = await prisma.mechanicProfile.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        businessName: true,
        logo: true,
        rating: true,
        totalReviews: true,
        totalJobsCompleted: true,
        yearsOfExperience: true,
        hourlyRate: true,
        isVerified: true,
      },
    })

    // Time helpers
    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0)
    const startOfWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

    // Get all service requests for this mechanic (assigned + invited)
    const assignedRequests = await prisma.mechanicServiceRequest.findMany({
      where: {
        mechanicId: user.id,
      },
      include: {
        offers: {
          where: {
            mechanicId: user.id,
            status: "ACCEPTED",
          },
          select: {
            totalAmount: true,
            createdAt: true,
          },
        },
      },
    })

    // Get invited requests (via notifications)
    const invitedNotifications = await prisma.mechanicNotification.findMany({
      where: {
        mechanicId: user.id,
        notificationType: "NEW_REQUEST",
      },
      include: {
        serviceRequest: {
          include: {
            offers: {
              where: {
                mechanicId: user.id,
                status: "ACCEPTED",
              },
              select: {
                totalAmount: true,
                createdAt: true,
              },
            },
          },
        },
      },
    })

    // Merge assigned and invited requests
    const allServiceRequestsMap = new Map()
    assignedRequests.forEach((r) => allServiceRequestsMap.set(r.id, r))
    invitedNotifications.forEach((n) => {
      const sr = n.serviceRequest
      if (sr && (!sr.mechanicId || sr.mechanicId !== user.id)) {
        if (!allServiceRequestsMap.has(sr.id)) {
          allServiceRequestsMap.set(sr.id, sr)
        }
      }
    })
    const allServiceRequests = Array.from(allServiceRequestsMap.values())

    // Get all offers for this mechanic
    const allOffers = await prisma.mechanicOffer.findMany({
      where: {
        mechanicId: user.id,
      },
      include: {
        serviceRequest: {
          select: {
            status: true,
            createdAt: true,
          },
        },
      },
    })

    // Calculate stats
    const totalRequests = allServiceRequests.length
    const pendingRequests = allServiceRequests.filter(
      (r) => r.status === "PENDING" || r.status === "QUOTED"
    ).length
    const activeJobs = allServiceRequests.filter(
      (r) => r.status === "ACCEPTED" || r.status === "IN_PROGRESS"
    ).length
    const completedJobs = allServiceRequests.filter((r) => r.status === "COMPLETED").length

    // Calculate earnings from accepted offers
    const acceptedOffers = allOffers.filter((o) => o.status === "ACCEPTED")
    const totalEarnings = acceptedOffers.reduce(
      (sum, offer) => sum + (offer.totalAmount || 0),
      0
    )

    // Calculate earnings by period
    const todayEarnings = acceptedOffers
      .filter((o) => new Date(o.createdAt) >= startOfDay)
      .reduce((sum, offer) => sum + (offer.totalAmount || 0), 0)

    const weekEarnings = acceptedOffers
      .filter((o) => new Date(o.createdAt) >= startOfWeek)
      .reduce((sum, offer) => sum + (offer.totalAmount || 0), 0)

    const monthEarnings = acceptedOffers
      .filter((o) => new Date(o.createdAt) >= startOfMonth)
      .reduce((sum, offer) => sum + (offer.totalAmount || 0), 0)

    // Get recent service requests (last 5) - assigned + invited
    const recentAssigned = await prisma.mechanicServiceRequest.findMany({
      where: {
        mechanicId: user.id,
      },
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
          },
        },
        offers: {
          where: {
            mechanicId: user.id,
          },
          select: {
            id: true,
            status: true,
            totalAmount: true,
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            offers: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    })

    // Get recent invited requests
    const recentInvitedNotifications = await prisma.mechanicNotification.findMany({
      where: {
        mechanicId: user.id,
        notificationType: "NEW_REQUEST",
      },
      include: {
        serviceRequest: {
          include: {
            customer: {
              select: {
                name: true,
                phone: true,
              },
            },
            offers: {
              where: {
                mechanicId: user.id,
              },
              select: {
                id: true,
                status: true,
                totalAmount: true,
              },
              orderBy: { createdAt: "desc" },
            },
            _count: {
              select: {
                offers: true,
              },
            },
          },
        },
      },
      orderBy: { sentAt: "desc" },
      take: 5,
    })

    // Merge and deduplicate recent requests
    const recentRequestsMap = new Map()
    recentAssigned.forEach((r) => recentRequestsMap.set(r.id, r))
    recentInvitedNotifications.forEach((n) => {
      const sr = n.serviceRequest
      if (sr && (!sr.mechanicId || sr.mechanicId !== user.id)) {
        if (!recentRequestsMap.has(sr.id)) {
          recentRequestsMap.set(sr.id, sr)
        }
      }
    })
    const recentRequests = Array.from(recentRequestsMap.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)

    // Get pending offers count
    const pendingOffers = allOffers.filter((o) => o.status === "PENDING").length

    // Get accepted offers count
    const acceptedOffersCount = acceptedOffers.length

    // Calculate average offer value
    const averageOfferValue =
      acceptedOffers.length > 0
        ? acceptedOffers.reduce((sum, o) => sum + (o.totalAmount || 0), 0) / acceptedOffers.length
        : 0

    // Get response rate (offers submitted / requests received)
    const responseRate =
      totalRequests > 0 ? (allOffers.length / totalRequests) * 100 : 0

    return NextResponse.json({
      profile: {
        businessName: mechanicProfile?.businessName || user.name,
        logo: mechanicProfile?.logo,
        rating: mechanicProfile?.rating || 0,
        totalReviews: mechanicProfile?.totalReviews || 0,
        totalJobsCompleted: mechanicProfile?.totalJobsCompleted || completedJobs,
        yearsOfExperience: mechanicProfile?.yearsOfExperience || 0,
        hourlyRate: mechanicProfile?.hourlyRate || 0,
        isVerified: mechanicProfile?.isVerified || false,
      },
      stats: {
        totalRequests,
        pendingRequests,
        activeJobs,
        completedJobs,
        totalEarnings,
        todayEarnings,
        weekEarnings,
        monthEarnings,
        pendingOffers,
        acceptedOffersCount,
        averageOfferValue,
        responseRate: Math.round(responseRate * 10) / 10, // Round to 1 decimal
      },
      recentRequests: recentRequests.map((req) => ({
        id: req.id,
        vehicleMake: req.vehicleMake,
        vehicleModel: req.vehicleModel,
        vehicleYear: req.vehicleYear,
        issueDescription: req.issueDescription,
        status: req.status,
        urgency: req.urgency,
        customer: req.customer,
        offers: req.offers,
        offersCount: req._count.offers,
        createdAt: req.createdAt,
      })),
    })
  } catch (error) {
    console.error("Mechanic dashboard fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}

