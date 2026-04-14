import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")
    const search = searchParams.get("search")
    const category = searchParams.get("category")
    const status = searchParams.get("status")
    const stockAlert = searchParams.get("stockAlert")

    const where: any = { pharmacyId: pharmacy.id }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { genericName: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
        { manufacturer: { contains: search, mode: "insensitive" } },
      ]
    }

    if (category) where.category = category
    if (status === "active") where.isActive = true
    if (status === "inactive") where.isActive = false
    if (stockAlert === "low") where.stock = { lte: 10 }
    if (stockAlert === "expired") {
      where.expiryDate = { lte: new Date() }
    }
    if (stockAlert === "expiring") {
      where.expiryDate = {
        lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        gt: new Date(),
      }
    }

    const [medicines, total] = await Promise.all([
      prisma.medicine.findMany({
        where,
        orderBy: { createdAt: "desc" },
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

    // Validate required fields
    const requiredFields = ["name", "dosage", "form", "category", "price", "stock", "expiryDate"]
    for (const field of requiredFields) {
      if (!data[field]) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 })
      }
    }

    // Validate expiry date
    const expiryDate = new Date(data.expiryDate)
    if (expiryDate <= new Date()) {
      return NextResponse.json({ error: "Expiry date must be in the future" }, { status: 400 })
    }

    const medicine = await prisma.medicine.create({
      data: {
        ...data,
        pharmacyId: pharmacy.id,
        expiryDate,
        images: data.images || [],
        activeIngredients: data.activeIngredients || [],
        sideEffects: data.sideEffects || [],
        contraindications: data.contraindications || [],
        tags: data.tags || [],
      },
    })

    return NextResponse.json(medicine, { status: 201 })
  } catch (error) {
    console.error("Medicine creation error:", error)
    return NextResponse.json({ error: "Failed to create medicine" }, { status: 500 })
  }
}
