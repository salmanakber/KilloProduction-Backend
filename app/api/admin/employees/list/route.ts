import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, hashPassword } from "@/lib/auth"
import { parseAdminAccess } from "@/lib/admin-access"
import { UserRole } from "@prisma/client"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const role = searchParams.get("role") || "ALL"
    const status = searchParams.get("status") || "ALL"

    const where: any = { role: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN] } }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ]
    }

    if (role !== "ALL") {
      where.adminProfile = {
        is: {
          permissions: {
            path: ["accessRole"],
            equals: role,
          },
        },
      }
    }

    if (status !== "ALL") {
      where.isActive = status === "ACTIVE"
    }

    const employees = await prisma.user.findMany({
      where,
      include: {
        userProfile: true,
        adminProfile: true,
      },
      orderBy: { createdAt: "desc" },
    })

    const formattedEmployees = employees.map((employee) => ({
      ...parseAdminAccess(employee.adminProfile?.permissions, employee.role),
      id: employee.id,
      name: employee.name,
      email: employee.email,
      phone: employee.phone || "",
      role: parseAdminAccess(employee.adminProfile?.permissions, employee.role).accessRole,
      department: employee.adminProfile?.department || "",
      permissions: parseAdminAccess(employee.adminProfile?.permissions, employee.role).grants,
      modules: parseAdminAccess(employee.adminProfile?.permissions, employee.role).modules,
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

export async function POST(request: NextRequest) {
  try {
    const actor = await authenticateRequest(request)
    if (!actor?.id || (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await request.json()
    const name = String(body?.name || "").trim()
    const email = String(body?.email || "").trim().toLowerCase()
    const phone = String(body?.phone || "").trim()
    const department = String(body?.department || "").trim()
    const accessRole = String(body?.role || "SUPPORT").toUpperCase()
    const grants = Array.isArray(body?.permissions) ? body.permissions.map((x: any) => String(x)) : []
    const modules = Array.isArray(body?.modules) ? body.modules.map((x: any) => String(x).toUpperCase()) : []

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 })
    }
    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) return NextResponse.json({ error: "Email already exists" }, { status: 409 })

    const temporaryPassword = `Temp@${Math.random().toString(36).slice(2, 8)}!`
    const password = await hashPassword(temporaryPassword)
    const created = await prisma.user.create({
      data: {
        name,
        email,
        phone: phone || null,
        role: accessRole === "SUPER_ADMIN" ? UserRole.SUPER_ADMIN : UserRole.ADMIN,
        isActive: true,
        isVerified: true,
        password,
        adminProfile: {
          create: {
            department: department || null,
            permissions: {
              accessRole,
              grants,
              modules,
            },
          },
        },
      },
      include: { adminProfile: true },
    })

    return NextResponse.json({
      success: true,
      employee: {
        id: created.id,
        name: created.name,
        email: created.email,
        role: accessRole,
      },
      temporaryPassword,
    })
  } catch (error) {
    console.error("Error creating employee:", error)
    return NextResponse.json({ error: "Failed to create employee" }, { status: 500 })
  }
}
