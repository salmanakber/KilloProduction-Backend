import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")
    const status = searchParams.get("status")
    const search = searchParams.get("search")

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {
      role: "RIDER",
      riderProfile: {
        isNot: null,
      },
    }

    if (status && status !== "ALL") {
      where.riderProfile = {
        ...where.riderProfile,
        is: {
          isApproved: status === "APPROVED",
        },
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ]
    }

    const [riders, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          riderProfile: true,
          riderEarnings: {
            select: {
              amount: true,
            },
          },
          customerRideBookings: {
            select: {
              id: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ])

    // Fetch all KycRejections for the fetched riders (entityId is the user.id for riders)
    const riderIds = riders.map(r => r.id)
    const kycRejections = riderIds.length > 0 ? await prisma.kycRejection.findMany({
      where: {
        entityType: "RIDER",
        entityId: { in: riderIds },
      },
      include: {
        rejectedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { rejectedAt: "desc" },
    }) : []
    
    // Create a map of entityId to rejections
    const rejectionMap = new Map<string, typeof kycRejections>()
    kycRejections.forEach(rejection => {
      if (!rejectionMap.has(rejection.entityId)) {
        rejectionMap.set(rejection.entityId, [])
      }
      rejectionMap.get(rejection.entityId)!.push(rejection)
    })

    const formattedRiders = riders.map((rider) => {
      const rejections = rejectionMap.get(rider.id) || []
      
      return {
        id: rider.id,
        name: rider.name || "Unknown",
        email: rider.email || "",
        phone: rider.phone || "",
        vehicleType: rider.riderProfile?.vehicleType || "Unknown",
        status: rider.riderProfile?.isApproved ? "APPROVED" : rider.riderProfile?.isVerified ? "PENDING" : "REJECTED",
        rating: rider.riderProfile?.rating || 0,
        totalRides: rider.customerRideBookings?.length || 0,
        totalEarnings: rider.riderEarnings?.reduce((sum, earning) => sum + earning.amount, 0) || 0,
        documentsVerified: rider.riderProfile?.documentsVerified || false,
        createdAt: rider.createdAt.toISOString(),
        lastActive: rider.riderProfile?.isOnline?.toISOString() || rider.createdAt.toISOString(),
        // Extended fields for editing
        vehicleBrand: rider.riderProfile?.vehicleBrand,
        vehicleModel: rider.riderProfile?.vehicleModel,
        vehicleYear: rider.riderProfile?.vehicleYear,
        vehicleColor: rider.riderProfile?.vehicleColor,
        licensePlate: rider.riderProfile?.licensePlate,
        licenseNumber: rider.riderProfile?.licenseNumber,
        licenseExpiry: rider.riderProfile?.licenseExpiry?.toISOString(),
        insurance: rider.riderProfile?.insurance,
        insuranceExpiry: rider.riderProfile?.insuranceExpiry?.toISOString(),
        nationalId: rider.riderProfile?.nationalId,
        maxDeliveryDistance: rider.riderProfile?.maxDeliveryDistance,
        modules: rider.riderProfile?.modules as string[] || [],
        rideType: (rider.riderProfile?.serviceTypes as any)?.rideType || null,
        serviceTypes: (rider.riderProfile?.serviceTypes as any)?.serviceTypes || {},
        // Image URLs (needed for admin KYC review)
        vehiclePhotos: rider.riderProfile?.vehiclePhotos || [],
        licensePhoto: rider.riderProfile?.licensePhoto || null,
        insurancePhoto: rider.riderProfile?.insurancePhoto || null,
        nationalIdPhoto: rider.riderProfile?.nationalIdPhoto || null,
        selfiePhoto: rider.riderProfile?.selfiePhoto || null,
        rejectionHistory: rejections.map(r => ({
          id: r.id,
          rejectionReason: r.rejectionReason,
          rejectedFields: r.rejectedFields,
          rejectedBy: r.rejectedByUser?.name || "Unknown Admin",
          rejectedAt: r.rejectedAt.toISOString(),
          isResolved: r.isResolved,
        })),
      }
    })

    return NextResponse.json({
      riders: formattedRiders,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching riders:", error)
    return NextResponse.json({ error: "Failed to fetch riders" }, { status: 500 })
  }
}
