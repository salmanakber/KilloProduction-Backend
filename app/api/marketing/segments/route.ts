import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "10")
    const type = searchParams.get("type")
    const isActive = searchParams.get("isActive")

    const where: any = {}
    if (type) where.segmentType = type
    if (isActive !== null) where.isActive = isActive === "true"

    const segments = await prisma.customerSegment.findMany({
      where,
      include: {
        _count: {
          select: { members: true },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    })

    const total = await prisma.customerSegment.count({ where })

    const mapped = segments.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? "",
      type: s.segmentType,
      criteria: (s.conditions as Record<string, unknown>) || {},
      memberCount: s._count?.members ?? 0,
      isActive: s.isActive,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }))

    return NextResponse.json({
      segments: mapped,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching segments:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, segmentType, conditions, isDynamic, priority, isActive } = body

    const segment = await prisma.customerSegment.create({
      data: {
        name,
        description,
        segmentType,
        conditions,
        isDynamic: isDynamic ?? true,
        priority: priority ?? 0,
        isActive: isActive ?? true,
      },
    })

    // If dynamic segment, calculate initial members
    if (isDynamic) {
      await calculateSegmentMembers(segment.id, conditions)
    }

    return NextResponse.json(segment, { status: 201 })
  } catch (error) {
    console.error("Error creating segment:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function calculateSegmentMembers(segmentId: string, conditions: any) {
  // This would contain the logic to calculate segment members based on conditions
  // For now, we'll implement a basic example
  try {
    const whereClause: any = {}

    // Example condition parsing
    if (conditions.orderCount) {
      // Users with specific order count
      const users = await prisma.user.findMany({
        where: {
          customerOrders: {
            some: {},
          },
        },
        include: {
          _count: {
            select: { customerOrders: true },
          },
        },
      })

      const filteredUsers = users.filter((user) => {
        const orderCount = user._count.customerOrders
        if (conditions.orderCount.operator === "gte") {
          return orderCount >= conditions.orderCount.value
        }
        if (conditions.orderCount.operator === "lte") {
          return orderCount <= conditions.orderCount.value
        }
        if (conditions.orderCount.operator === "eq") {
          return orderCount === conditions.orderCount.value
        }
        return false
      })

      // Add users to segment
      for (const user of filteredUsers) {
        await prisma.customerSegmentMember.upsert({
          where: {
            segmentId_userId: {
              segmentId,
              userId: user.id,
            },
          },
          update: {
            isActive: true,
          },
          create: {
            segmentId,
            userId: user.id,
          },
        })
      }
    }

    if (conditions.lastLoginDays) {
      // Users based on last login
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - conditions.lastLoginDays.value)

      const users = await prisma.user.findMany({
        where: {
          lastLoginAt: conditions.lastLoginDays.operator === "gte" ? { gte: cutoffDate } : { lte: cutoffDate },
        },
      })

      for (const user of users) {
        await prisma.customerSegmentMember.upsert({
          where: {
            segmentId_userId: {
              segmentId,
              userId: user.id,
            },
          },
          update: {
            isActive: true,
          },
          create: {
            segmentId,
            userId: user.id,
          },
        })
      }
    }

    if (Array.isArray(conditions.location) && conditions.location.length > 0) {
      const needles = conditions.location
        .map((v: unknown) => String(v || "").trim().toLowerCase())
        .filter(Boolean)

      if (needles.length > 0) {
        const users = await prisma.user.findMany({
          where: { role: "CUSTOMER" },
          select: {
            id: true,
            userProfile: {
              select: {
                city: true,
                country: true,
              },
            },
          },
        })

        const matchedUsers = users.filter((u) => {
          const city = (u.userProfile?.city || "").toLowerCase()
          const country = (u.userProfile?.country || "").toLowerCase()
          const composite = `${city} ${country}`.trim()
          return needles.some((needle: string) => composite.includes(needle))
        })

        for (const user of matchedUsers) {
          await prisma.customerSegmentMember.upsert({
            where: {
              segmentId_userId: {
                segmentId,
                userId: user.id,
              },
            },
            update: {
              isActive: true,
            },
            create: {
              segmentId,
              userId: user.id,
            },
          })
        }
      }
    }
  } catch (error) {
    console.error("Error calculating segment members:", error)
  }
}
