import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const common = searchParams.get("common")
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {}

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ]
    }

    if (common && common !== "ALL") {
      where.isCommon = common === "true"
    }

    if (status && status !== "ALL") {
      where.isActive = status === "true"
    }

    const [illnesses, total] = await Promise.all([
      prisma.illnessCategory.findMany({
        where,
        orderBy: [{ isCommon: "desc" }, { name: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.illnessCategory.count({ where }),
    ])

    return NextResponse.json({
      illnesses,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Illness categories fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch illness categories" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const data = await request.json()
    const { name, displayName, description, icon, isCommon, symptoms, medicines } = data

    if (!name || !displayName) {
      return NextResponse.json({ error: "Name and display name are required" }, { status: 400 })
    }

    // Check if illness category already exists
    const existing = await prisma.illnessCategory.findUnique({
      where: { name: name.toLowerCase() },
    })

    if (existing) {
      return NextResponse.json({ error: "Illness category already exists" }, { status: 400 })
    }

    const illness = await prisma.illnessCategory.create({
      data: {
        name: name.toLowerCase(),
        displayName,
        description,
        icon,
        isCommon: isCommon || false,
        symptoms: symptoms || [],
        medicines: medicines || [],
      },
    })

    return NextResponse.json(illness, { status: 201 })
  } catch (error) {
    console.error("Illness category creation error:", error)
    return NextResponse.json({ error: "Failed to create illness category" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const data = await request.json()
    const { id, name, displayName, description, icon, isCommon, symptoms, medicines, isActive } = data

    if (!id) {
      return NextResponse.json({ error: "Illness category ID is required" }, { status: 400 })
    }

    const illness = await prisma.illnessCategory.update({
      where: { id },
      data: {
        name: name?.toLowerCase(),
        displayName,
        description,
        icon,
        isCommon,
        symptoms,
        medicines,
        isActive,
      },
    })

    return NextResponse.json(illness)
  } catch (error) {
    console.error("Illness category update error:", error)
    return NextResponse.json({ error: "Failed to update illness category" }, { status: 500 })
  }
}
