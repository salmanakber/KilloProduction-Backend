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
    const search = searchParams.get("search")
    const category = searchParams.get("category")
    const origin = searchParams.get("origin")
    const illness = searchParams.get("illness")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = { isActive: true }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { genericName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ]
    }

    if (category) where.category = category
    if (origin) where.origins = { has: origin }
    if (illness) where.illnessTypes = { has: illness }

    const [medicines, total] = await Promise.all([
      prisma.centralMedicine.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.centralMedicine.count({ where }),
    ])

    return NextResponse.json({
      medicines,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Central medicines fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch medicines" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const data = await request.json()
    const {
      name,
      genericName,
      description,
      purpose,
      dosageInfo,
      warnings,
      sideEffects,
      category,
      illnessTypes,
      origins,
      activeIngredients,
      form,
      strength,
      manufacturer,
      images,
    } = data

    // Validate required fields
    if (!name || !category || !origins || origins.length === 0) {
      return NextResponse.json({ error: "Name, category, and at least one origin are required" }, { status: 400 })
    }

    const medicine = await prisma.centralMedicine.create({
      data: {
        name,
        genericName,
        description,
        purpose,
        dosageInfo,
        warnings,
        sideEffects: sideEffects || [],
        category,
        illnessTypes: illnessTypes || [],
        origins,
        activeIngredients: activeIngredients || [],
        form,
        strength,
        manufacturer,
        images: images || [],
      },
    })

    return NextResponse.json(medicine, { status: 201 })
  } catch (error) {
    console.error("Central medicine creation error:", error)
    return NextResponse.json({ error: "Failed to create medicine" }, { status: 500 })
  }
}
