import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "WHOLESALER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const origin = searchParams.get("origin")
    const illnessType = searchParams.get("illnessType")
    const category = searchParams.get("category")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    // Build where clause
    const where: any = {
      isActive: true,
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { genericName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { manufacturer: { contains: search, mode: "insensitive" } },
      ]
    }

    if (category) {
      where.category = category
    }

    if (illnessType) {
      where.illnessTypes = {
        array_contains: [illnessType]
      }
    }

    // Get medicines with origins
    const medicines = await prisma.centralMedicine.findMany({
      where,
      include: {
        medicineOrigins: {
          include: {
            medicineOrigin: true
          }
        }
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    })

    // Get all medicine origins for filtering
    const origins = await prisma.medicineOrigin.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" }
    })

    // Get all illness categories for filtering
    const illnessCategories = await prisma.illnessCategory.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" }
    })

    // Get categories
    const categories = await prisma.centralMedicine.groupBy({
      by: ['category'],
      where: { isActive: true },
      _count: { category: true }
    })

    // Filter by origin if specified
    let filteredMedicines = medicines
    if (origin) {
      filteredMedicines = medicines.filter(medicine => 
        medicine.medicineOrigins.some(mo => mo.medicineOrigin.name === origin)
      )
    }

    // Group medicines by origin and illness types
    const groupedMedicines = filteredMedicines.reduce((acc, medicine) => {
      // Group by origin
      medicine.medicineOrigins.forEach(mo => {
        const originName = mo.medicineOrigin.name
        if (!acc[originName]) {
          acc[originName] = {
            origin: mo.medicineOrigin,
            illnessGroups: {}
          }
        }

        // Group by illness types
        const illnessTypes = medicine.illnessTypes as string[] || []
        illnessTypes.forEach(illnessType => {
          if (!acc[originName].illnessGroups[illnessType]) {
            acc[originName].illnessGroups[illnessType] = []
          }
          acc[originName].illnessGroups[illnessType].push(medicine)
        })

        // If no illness types, put in "General" category
        if (illnessTypes.length === 0) {
          if (!acc[originName].illnessGroups["General"]) {
            acc[originName].illnessGroups["General"] = []
          }
          acc[originName].illnessGroups["General"].push(medicine)
        }
      })

      return acc
    }, {} as any)

    return NextResponse.json({
      medicines: filteredMedicines,
      groupedMedicines,
      filters: {
        origins,
        illnessCategories,
        categories: categories.map(c => ({ name: c.category, count: c._count.category }))
      },
      pagination: {
        page,
        limit,
        total: filteredMedicines.length,
        pages: Math.ceil(filteredMedicines.length / limit),
      },
    })
  } catch (error) {
    console.error("Central medicines fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch central medicines" }, { status: 500 })
  }
}
