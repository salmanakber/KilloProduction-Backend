import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const severity = searchParams.get("severity")
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}
    if (severity && severity !== "ALL") {
      where.severity = severity
    }
    if (status && status !== "ALL") {
      where.status = status
    }

    // Get security events from audit logs
    const [events, totalCount] = await Promise.all([
      prisma.securityEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      prisma.securityEvent.count({ where }),
    ])

    // Format events for frontend
    const formattedEvents = events.map((event) => ({
      id: event.id,
      type: event.eventType,
      severity: event.severity,
      userId: event.user?.id,
      userName: event.user?.name,
      userEmail: event.user?.email,
      userRole: event.user?.role,
      description: event.description,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      location: event.location,
      timestamp: event.createdAt,
      status: event.status,
      metadata: event.metadata ? JSON.parse(event.metadata) : null,
    }))

    return NextResponse.json({
      events: formattedEvents,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching security events:", error)
    return NextResponse.json({ error: "Failed to fetch security events" }, { status: 500 })
  }
}
