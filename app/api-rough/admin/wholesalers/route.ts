import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") // "pending", "approved", "all"
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {}

    if (status === "pending") {
      where.isVerified = false
    } else if (status === "approved") {
      where.isVerified = true
    }

    const [wholesalers, total] = await Promise.all([
      prisma.wholesaler.findMany({
        where,
        include: {
          user: {
            select: {
              name: true,
              email: true,
              phone: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              wholesalerProducts: true,
              supplierOrders: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.wholesaler.count({ where }),
    ])

    return NextResponse.json({
      wholesalers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Wholesalers fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch wholesalers" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const data = await request.json()
    const { userId, companyName, licenseNumber, description, address, phone, email, website, requestedSpecialties } =
      data

    // Validate required fields
    if (!userId || !companyName || !licenseNumber || !address || !phone) {
      return NextResponse.json(
        {
          error: "User ID, company name, license number, address, and phone are required",
        },
        { status: 400 },
      )
    }

    // Check if user already has a wholesaler account
    const existingWholesaler = await prisma.wholesaler.findUnique({
      where: { userId },
    })

    if (existingWholesaler) {
      return NextResponse.json(
        {
          error: "User already has a wholesaler account",
        },
        { status: 400 },
      )
    }

    // Create wholesaler (pending approval)
    const wholesaler = await prisma.wholesaler.create({
      data: {
        userId,
        companyName,
        licenseNumber,
        description,
        address,
        phone,
        email,
        website,
        specialties: requestedSpecialties || [],
        isVerified: false, // Requires admin approval
      },
    })

    // Update user role
    await prisma.user.update({
      where: { id: userId },
      data: { role: "VENDOR" },
    })

    return NextResponse.json(wholesaler, { status: 201 })
  } catch (error) {
    console.error("Wholesaler creation error:", error)
    return NextResponse.json({ error: "Failed to create wholesaler" }, { status: 500 })
  }
}
