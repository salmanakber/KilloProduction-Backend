import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {}

    if (user.role === "CUSTOMER") {
      where.userId = user.id
    }

    if (status) {
      where.status = status
    }

    const [prescriptions, total] = await Promise.all([
      prisma.prescription.findMany({
        where,
        include: {
          user: {
            select: {
              name: true,
              phone: true,
            },
          },
          reviews: {
            include: {
              pharmacy: {
                select: {
                  pharmacyName: true,
                  isVerified: true,
                },
              },
            },
            orderBy: { reviewedAt: "desc" },
          },
          chats: {
            where: { isActive: true },
            include: {
              pharmacy: {
                select: {
                  pharmacyName: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.prescription.count({ where }),
    ])

    return NextResponse.json({
      prescriptions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Prescriptions fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch prescriptions" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()

    const prescription = await prisma.prescription.create({
      data: {
        ...data,
        userId: user.id,
      },
      include: {
        user: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
    })

    // Notify pharmacies about new prescription
    const pharmacies = await prisma.pharmacy.findMany({
      where: {
        isActive: true,
        isVerified: true,
      },
      include: {
        user: true,
      },
    })

    // TODO: Send notifications to pharmacies
    for (const pharmacy of pharmacies) {
      console.log(`Notifying pharmacy ${pharmacy.pharmacyName} about new prescription`)
    }

    return NextResponse.json(prescription, { status: 201 })
  } catch (error) {
    console.error("Prescription creation error:", error)
    return NextResponse.json({ error: "Failed to create prescription" }, { status: 500 })
  }
}
