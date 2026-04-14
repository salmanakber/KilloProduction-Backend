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
    const search = searchParams.get("search") || ""
    const role = searchParams.get("role") || "ALL"
    const status = searchParams.get("status") || "ALL"

    const where: any = {
      role: {
        in: ["SUPER_ADMIN", "ADMIN", "SUPPORT", "OPERATIONS", "FINANCE", "MARKETING", "HR"],
      },
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ]
    }

    if (role !== "ALL") {
      where.role = role
    }

    if (status !== "ALL") {
      where.isActive = status === "ACTIVE"
    }

    const employees = await prisma.user.findMany({
      where,
      include: {
        userProfile: true,
        adminProfile: {
          include: {
            permissions: true,
            modules: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const formattedEmployees = employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      phone: employee.phone || "",
      role: employee.role,
      department: employee.adminProfile?.department || "",
      permissions: employee.adminProfile?.permissions.map((p) => p.name) || [],
      modules: employee.adminProfile?.modules.map((m) => m.name) || [],
      status: employee.isActive ? "ACTIVE" : "INACTIVE",
      isVerified: employee.isVerified,
      lastLogin: employee.lastLoginAt ? new Date(employee.lastLoginAt).toLocaleDateString() : "Never",
      joinedAt: employee.createdAt.toISOString(),
      avatar: employee.userProfile?.avatar,
    }))

    return NextResponse.json({ employees: formattedEmployees })
  } catch (error) {
    console.error("Error fetching employees:", error)
    return NextResponse.json({ error: "Failed to fetch employees" }, { status: 500 })
  }
}
