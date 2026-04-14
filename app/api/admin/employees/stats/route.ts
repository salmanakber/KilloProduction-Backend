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

    const adminRoles = ["SUPER_ADMIN", "ADMIN", "SUPPORT", "OPERATIONS", "FINANCE", "MARKETING", "HR"]

    const [totalEmployees, activeEmployees, inactiveEmployees, pendingVerification] = await Promise.all([
      prisma.user.count({
        where: { role: { in: adminRoles } },
      }),
      prisma.user.count({
        where: {
          role: { in: adminRoles },
          isActive: true,
        },
      }),
      prisma.user.count({
        where: {
          role: { in: adminRoles },
          isActive: false,
        },
      }),
      prisma.user.count({
        where: {
          role: { in: adminRoles },
          isVerified: false,
        },
      }),
    ])

    const stats = {
      totalEmployees,
      activeEmployees,
      inactiveEmployees,
      pendingVerification,
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error("Error fetching employee stats:", error)
    return NextResponse.json({ error: "Failed to fetch employee stats" }, { status: 500 })
  }
}
