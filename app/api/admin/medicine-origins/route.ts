import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest()
    console.log(session)
    if (!session || session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "10")
    const search = searchParams.get("search") || ""
    const status = searchParams.get("status") || "ALL"

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } }
      ]
    }
    if (status !== "ALL") {
      where.isActive = status === "true"
    }

    // Get medicine origins with pagination
    const [medicineOrigins, total] = await Promise.all([
      prisma.medicineOrigin.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              centralMedicines: true,
              pharmacySpecializations: true
            }
          }
        }
      }),
      prisma.medicineOrigin.count({ where })
    ])

    const pages = Math.ceil(total / limit)

    return NextResponse.json({
      medicineOrigins,
      pagination: {
        page,
        limit,
        total,
        pages
      }
    })
  } catch (error) {
    console.error("Get medicine origins error:", error)
    return NextResponse.json({ 
      error: "Failed to fetch medicine origins" 
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
        const session = await authenticateRequest()
    if (!session || session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { name, displayName, description } = await request.json()

    if (!name || !displayName) {
      return NextResponse.json({ 
        error: "Name and display name are required" 
      }, { status: 400 })
    }

    // Check if name already exists
    const existing = await prisma.medicineOrigin.findUnique({
      where: { name: name.toUpperCase() }
    })

    if (existing) {
      return NextResponse.json({ 
        error: "Medicine origin with this name already exists" 
      }, { status: 400 })
    }

    const medicineOrigin = await prisma.medicineOrigin.create({
      data: {
        name: name.toUpperCase(),
        displayName,
        description
      }
    })

    return NextResponse.json({
      success: true,
      medicineOrigin,
      message: "Medicine origin created successfully"
    }, { status: 201 })
  } catch (error) {
    console.error("Create medicine origin error:", error)
    return NextResponse.json({ 
      error: "Failed to create medicine origin" 
    }, { status: 500 })
  }
}
