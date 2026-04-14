import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const category = searchParams.get("category")
    const form = searchParams.get("form")
    const prescriptionRequired = searchParams.get("prescriptionRequired")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {
      isActive: true,
      stock: { gt: 0 },
      expiryDate: { gt: new Date() },
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { genericName: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
        { manufacturer: { contains: search, mode: "insensitive" } },
      ]
    }

    if (category) where.category = category
    if (form) where.form = form
    if (prescriptionRequired !== null) {
      where.isPrescriptionRequired = prescriptionRequired === "true"
    }

    const [medicines, total] = await Promise.all([
      prisma.medicine.findMany({
        where,
        include: {
          pharmacy: {
            select: {
              pharmacyName: true,
              rating: true,
              isVerified: true,
              is24Hours: true,
              deliveryAvailable: true,
            },
          },
        },
        orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.medicine.count({ where }),
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
    console.error("Medicines fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch medicines" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    const data = await request.json()

    const medicine = await prisma.medicine.create({
      data: {
        ...data,
        pharmacyId: pharmacy.id,
      },
      include: {
        pharmacy: {
          select: {
            pharmacyName: true,
            rating: true,
            isVerified: true,
          },
        },
      },
    })

    return NextResponse.json(medicine, { status: 201 })
  } catch (error) {
    console.error("Medicine creation error:", error)
    return NextResponse.json({ error: "Failed to create medicine" }, { status: 500 })
  }
}
