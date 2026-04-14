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
    const category = searchParams.get("category")
    const form = searchParams.get("form")
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { genericName: { contains: search, mode: "insensitive" } },
        { manufacturer: { contains: search, mode: "insensitive" } },
      ]
    }
    if (category && category !== "ALL") {
      where.category = category
    }
    if (form && form !== "ALL") {
      where.form = form
    }
    if (status && status !== "ALL") {
      where.isActive = status === "true"
    }

    const [medicines, totalCount] = await Promise.all([
      prisma.centralMedicine.findMany({
        where,
        skip,
        take: limit,
        include: {
          medicineOrigins: {
            include: {
              medicineOrigin: true,
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.centralMedicine.count({ where }),
    ])

    return NextResponse.json({
      medicines,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching medicines:", error)
    return NextResponse.json({ error: "Failed to fetch medicines" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const medicineData = await request.json()
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
      medicineOriginIds,
      activeIngredients,
      form,
      strength,
      manufacturer,
      images,
    } = medicineData

    if (!name || !category) {
      return NextResponse.json({ error: "Medicine name and category are required" }, { status: 400 })
    }

    const medicine = await prisma.centralMedicine.create({
      data: {
        name,
        genericName,
        description,
        purpose,
        dosageInfo,
        warnings,
        sideEffects,
        category,
        illnessTypes,
        activeIngredients,
        form,
        strength,
        manufacturer,
        images,
        medicineOrigins: {
          create: medicineOriginIds?.map((originId: string) => ({
            medicineOriginId: originId
          })) || []
        }
      },
    })

    return NextResponse.json({ medicine }, { status: 201 })
  } catch (error) {
    console.error("Error creating medicine:", error)
    return NextResponse.json({ error: "Failed to create medicine" }, { status: 500 })
  }
}
