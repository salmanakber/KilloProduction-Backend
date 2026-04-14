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

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const role = searchParams.get("role")
    const search = searchParams.get("search")
    const isActive = searchParams.get("isActive")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {}

    if (role) {
      where.role = role
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ]
    }

    if (isActive !== null) {
      where.isActive = isActive === "true"
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isVerified: true,
          isActive: true,
          createdAt: true,
          profile: {
            select: {
              firstName: true,
              lastName: true,
              profileImage: true,
            },
          },
          vendorProfile: {
            select: {
              businessName: true,
              businessType: true,
              isVerified: true,
            },
          },
          riderProfile: {
            select: {
              vehicleType: true,
              isVerified: true,
              totalDeliveries: true,
              rating: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ])

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { userId, action, data } = await request.json()

    if (!userId || !action) {
      return NextResponse.json({ error: "User ID and action are required" }, { status: 400 })
    }

    let updatedUser

    switch (action) {
      case "activate":
        updatedUser = await prisma.user.update({
          where: { id: userId },
          data: { isActive: true },
        })
        break

      case "deactivate":
        updatedUser = await prisma.user.update({
          where: { id: userId },
          data: { isActive: false },
        })
        break

      case "verify":
        updatedUser = await prisma.user.update({
          where: { id: userId },
          data: { isVerified: true },
        })
        break

      case "update":
        updatedUser = await prisma.user.update({
          where: { id: userId },
          data: data,
        })
        break

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    return NextResponse.json({ user: updatedUser })
  } catch (error) {
    console.error("Error updating user:", error)
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}
