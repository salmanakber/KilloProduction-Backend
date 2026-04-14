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

    const where: any = {
      role: "MECHANIC",
      mechanicProfile: {
        some: {},
      },
    }

    if (status && status !== "ALL") {
      if (status === "PENDING") {
        where.mechanicProfile = {
          some: {
            isVerified: false,
          },
        }
      } else if (status === "APPROVED") {
        where.mechanicProfile = {
          some: {
            isVerified: true,
          },
        }
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        {
          mechanicProfile: {
            some: {
              OR: [
                { businessName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
                { address: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        },
      ]
    }

    const [mechanicUsers, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          mechanicProfile: {
            include: {
              expertise: true,
              _count: {
                select: {
                  serviceRequests: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ])

    const profileIds = mechanicUsers
      .flatMap((u) => u.mechanicProfile.map((p) => p.id))
      .filter(Boolean) as string[]

    const kycRejections =
      profileIds.length > 0
        ? await prisma.kycRejection.findMany({
            where: {
              entityType: "MECHANIC",
              entityId: { in: profileIds },
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
          })
        : []

    const rejectionMap = new Map<string, typeof kycRejections>()
    kycRejections.forEach((rejection) => {
      if (!rejectionMap.has(rejection.entityId)) {
        rejectionMap.set(rejection.entityId, [])
      }
      rejectionMap.get(rejection.entityId)!.push(rejection)
    })

    const mechanics = mechanicUsers.map((u) => {
      const profile = u.mechanicProfile[0]
      const pid = profile?.id
      const rejections = pid ? rejectionMap.get(pid) || [] : []

      return {
        id: pid ?? u.id,
        userId: u.id,
        name: profile?.businessName || u.name || "Unknown",
        businessName: profile?.businessName,
        businessType: profile?.businessType,
        email: profile?.email || u.email || "",
        phone: profile?.phone || u.phone || "",
        address: profile?.address || "",
        city: profile?.city,
        state: profile?.state,
        status: profile?.isVerified ? "APPROVED" : "PENDING",
        isVerified: profile?.isVerified ?? false,
        registrationDate: (profile?.createdAt ?? u.createdAt).toISOString(),
        createdAt: u.createdAt.toISOString(),
        documents: {
          businessLicense: profile?.businessLicense || null,
          logo: profile?.logo || null,
          coverImage: profile?.coverImage || null,
        },
        rejectionHistory: rejections.map((r) => ({
          id: r.id,
          rejectionReason: r.rejectionReason,
          rejectedFields: r.rejectedFields,
          rejectedBy: r.rejectedByUser?.name || "Unknown Admin",
          rejectedAt: r.rejectedAt.toISOString(),
          isResolved: r.isResolved,
        })),
        serviceRequestCount: profile?._count?.serviceRequests ?? 0,
        details: profile,
      }
    })

    return NextResponse.json({
      mechanics,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching mechanics:", error)
    return NextResponse.json({ error: "Failed to fetch mechanics" }, { status: 500 })
  }
}
