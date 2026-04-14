import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const illness = searchParams.get("illness")
    const origin = searchParams.get("origin")
    const category = searchParams.get("category")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = { isActive: true }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { genericName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { purpose: { contains: search, mode: "insensitive" } },
      ]
    }

    if (illness) {
      where.illnessTypes = { has: illness }
    }

    if (origin) {
      where.origins = { has: origin }
    }

    if (category) {
      where.category = category
    }

    const [medicines, total] = await Promise.all([
      prisma.centralMedicine.findMany({
        where,
        include: {
          pharmacyMedicines: {
            where: { isAvailable: true },
            include: {
              pharmacy: {
                select: {
                  id: true,
                  pharmacyName: true,
                  rating: true,
                  isVerified: true,
                  deliveryAvailable: true,
                  responseTime: true,
                },
              },
            },
          },
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.centralMedicine.count({ where }),
    ])

    // Add availability info to each medicine
    const medicinesWithAvailability = medicines.map((medicine) => ({
      ...medicine,
      availablePharmacies: medicine.pharmacyMedicines.length,
      lowestPrice:
        medicine.pharmacyMedicines.length > 0 ? Math.min(...medicine.pharmacyMedicines.map((pm) => pm.price)) : null,
      nearestPharmacy: medicine.pharmacyMedicines[0]?.pharmacy || null,
    }))

    return NextResponse.json({
      medicines: medicinesWithAvailability,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Medicine search error:", error)
    return NextResponse.json({ error: "Failed to search medicines" }, { status: 500 })
  }
}
