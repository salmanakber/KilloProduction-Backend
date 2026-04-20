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
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    // Build where clause
    const where: any = {
      suggestedBy: wholesaler.id,
      suggestedByType: "WHOLESALER",
    }

    if (status && status !== "ALL") {
      where.status = status
    }

    const [suggestions, total] = await Promise.all([
      prisma.medicineSuggestion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.medicineSuggestion.count({ where }),
    ])

    return NextResponse.json({
      suggestions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Medicine suggestions fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch suggestions" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json()
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
      activeIngredients,
      form,
      strength,
      manufacturer,
      images,
    } = body

    // Validate required fields
    if (!name || !category || !form) {
      return NextResponse.json(
        { error: "Name, category, and form are required" },
        { status: 400 }
      )
    }

    // Check if medicine already exists in CentralMedicine
    const existingMedicine = await prisma.centralMedicine.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        isActive: true,
      },
    })

    if (existingMedicine) {
      return NextResponse.json(
        { error: "This medicine already exists in our database. Please search for it instead." },
        { status: 400 }
      )
    }

    // Check if wholesaler already suggested this medicine
    const existingSuggestion = await prisma.medicineSuggestion.findFirst({
      where: {
        suggestedBy: wholesaler.id,
        suggestedByType: "WHOLESALER",
        name: { equals: name, mode: "insensitive" },
        status: "PENDING",
      },
    })

    if (existingSuggestion) {
      return NextResponse.json(
        { error: "You have already suggested this medicine and it's pending review" },
        { status: 400 }
      )
    }

    // Create medicine suggestion
    const suggestion = await prisma.medicineSuggestion.create({
      data: {
        suggestedBy: wholesaler.id,
        suggestedByType: "WHOLESALER",
        name,
        genericName,
        description,
        purpose,
        dosageInfo,
        warnings,
        sideEffects: sideEffects ? JSON.parse(JSON.stringify(sideEffects)) : null,
        category,
        illnessTypes: illnessTypes ? JSON.parse(JSON.stringify(illnessTypes)) : null,
        activeIngredients: activeIngredients ? JSON.parse(JSON.stringify(activeIngredients)) : null,
        form,
        strength,
        manufacturer,
        images: images ? JSON.parse(JSON.stringify(images)) : null,
        status: "PENDING",
      },
    })

    // Send notification to admin about new medicine suggestion
    const { NotificationBridge } = await import("@/lib/notification-bridge")
    
    // Get all admin users
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    })

    // Send notification to all admins
    for (const admin of adminUsers) {
      await NotificationBridge.sendNotification({
        userId: admin.id,
        title: "New Medicine Suggestion",
        message: `${wholesaler.companyName} has suggested a new medicine: ${name}`,
        type: "SYSTEM",
        module: "ADMIN",
        data: {
          suggestionId: suggestion.id,
          medicineName: name,
          wholesalerName: wholesaler.companyName,
        },
        actionUrl: `/admin/medicines/wholesaler-suggestions?suggestion=${suggestion.id}`,
      })
    }

    return NextResponse.json({
      message: "Medicine suggestion submitted successfully. It will be reviewed by our admin team.",
      suggestion: {
        id: suggestion.id,
        name: suggestion.name,
        category: suggestion.category,
        status: suggestion.status,
        createdAt: suggestion.createdAt,
      },
    })
  } catch (error) {
    console.error("Medicine suggestion creation error:", error)
    return NextResponse.json(
      { error: "Failed to submit medicine suggestion" },
      { status: 500 }
    )
  }
}

