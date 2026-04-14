import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")

    const where: any = { customerId: user.id }
    if (status) where.status = status

    const requests = await prisma.partRequest.findMany({
      where,
      include: {
        offers: {
          include: {
            vendor: {
              include: {
                user: {
                  select: { name: true, phone: true },
                },
                autoPartsStore: {
                  select: { storeName: true, rating: true, isVerified: true },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { offers: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ requests })
  } catch (error) {
    console.error("Part requests fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch part requests" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()

    // Validate required fields
    const requiredFields = ["partName", "vehicleMake", "vehicleModel", "vehicleYear"]
    for (const field of requiredFields) {
      if (!data[field]) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 })
      }
    }

    // Generate request number
    const requestNumber = `PR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const partRequest = await prisma.partRequest.create({
      data: {
        customerId: user.id,
        requestNumber,
        partName: data.partName,
        vehicleMake: data.vehicleMake,
        vehicleModel: data.vehicleModel,
        vehicleYear: data.vehicleYear,
        category: data.category,
        description: data.description,
        urgency: data.urgency || "MEDIUM",
        maxBudget: data.maxBudget ? Number.parseFloat(data.maxBudget) : null,
        preferredCondition: data.preferredCondition || "ANY",
        images: data.images || [],
        status: "ACTIVE",
      },
    })

    // Find matching vendors based on category and location
    const matchingVendors = await prisma.user.findMany({
      where: {
        role: "VENDOR",
        isActive: true,
        autoPartsStore: {
          isVerified: true,
          isActive: true,
        },
      },
      include: {
        autoPartsStore: true,
      },
    })

    // Send notifications to matching vendors
    const notifications = matchingVendors.map((vendor) => ({
      userId: vendor.id,
      title: "New Part Request",
      message: `Customer looking for ${data.partName} for ${data.vehicleMake} ${data.vehicleModel} ${data.vehicleYear}`,
      type: "PART_REQUEST" as const,
      module: "AUTO_PARTS",
      data: {
        requestId: partRequest.id,
        partName: data.partName,
        vehicle: `${data.vehicleMake} ${data.vehicleModel} ${data.vehicleYear}`,
        urgency: data.urgency,
      },
    }))

    await prisma.notification.createMany({
      data: notifications,
    })

    return NextResponse.json(partRequest, { status: 201 })
  } catch (error) {
    console.error("Part request creation error:", error)
    return NextResponse.json({ error: "Failed to create part request" }, { status: 500 })
  }
}
