import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
import { emitAutoPartsQuoteSocket } from "@/lib/auto-parts-realtime"

// GET - Fetch quotes (for customers or mechanics)
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const mechanicId = searchParams.get("mechanicId")
    const status = searchParams.get("status")

    const where: any = {}

    if (user.role === "CUSTOMER") {
      where.customerId = user.id
      if (mechanicId) {
        where.mechanicId = mechanicId
      }
    } else if (user.role === "MECHANIC") {
      where.mechanicId = user.id
    }

    if (status) {
      where.status = status
    }

    const quotes = await prisma.mechanicQuote.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatar: true,
          },
        },
        mechanic: {
          select: {
            id: true,
            name: true,
            mechanicProfile: {
              select: {
                businessName: true,
                logo: true,
                rating: true,
                totalJobsCompleted: true,
                yearsOfExperience: true,
              },
            },
          },
        },
        serviceRequest: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ quotes })
  } catch (error) {
    console.error("Mechanic quotes fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch quotes" }, { status: 500 })
  }
}

// POST - Customer requests a quote from a mechanic
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized - Customer access only" }, { status: 401 })
    }

    const data = await request.json()

    // Validate required fields
    if (!data.mechanicId || !data.vehicleMake || !data.vehicleModel || !data.issueDescription) {
      return NextResponse.json(
        { error: "mechanicId, vehicleMake, vehicleModel, and issueDescription are required" },
        { status: 400 }
      )
    }

    // Check if mechanic exists
    const mechanic = await prisma.user.findUnique({
      where: { id: data.mechanicId },
      include: { mechanicProfile: true },
    })

    if (!mechanic || mechanic.role !== "MECHANIC" || !mechanic.mechanicProfile) {
      return NextResponse.json({ error: "Invalid mechanic" }, { status: 400 })
    }

    // Set expiry date (default 7 days from now)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // Create quote request (serviceCharges and totalAmount will be null until mechanic submits pricing)
    const quote = await prisma.mechanicQuote.create({
      data: {
        customerId: user.id,
        mechanicId: data.mechanicId,
        vehicleMake: data.vehicleMake,
        vehicleModel: data.vehicleModel,
        vehicleYear: data.vehicleYear || null,
        issueDescription: data.issueDescription,
        customerLatitude: data.customerLatitude ? parseFloat(data.customerLatitude) : null,
        customerLongitude: data.customerLongitude ? parseFloat(data.customerLongitude) : null,
        customerAddress: data.customerAddress || null,
        customerCity: data.customerCity || null,
        urgency: data.urgency || "MEDIUM",
        serviceCharges: null, // Will be set when mechanic submits quote
        totalAmount: null, // Will be set when mechanic submits quote
        expiresAt,
        status: "PENDING",
      },
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
          },
        },
        mechanic: {
          select: {
            name: true,
            mechanicProfile: {
              select: {
                businessName: true,
                logo: true,
              },
            },
          },
        },
      },
    })

    // Notify mechanic
    emitAutoPartsQuoteSocket(data.mechanicId, {
      quoteId: quote.id,
      status: "PENDING",
      event: "quote_requested",
      customerId: user.id,
    })

    await NotificationBridge.sendNotification({
      userId: data.mechanicId,
      title: "New Quote Request",
      message: `${user.name} has requested a quote for ${data.vehicleMake} ${data.vehicleModel}`,
      type: "MECHANIC_QUOTE_REQUEST",
      module: "AUTO_PARTS",
      actionUrl: `/auto-parts/mechanics/quotes/${quote.id}`,
      data: {
        actionType: "navigate",
        screen: 'MechanicQuoteDetails',
        params: [
          { name: 'quoteId', value: quote.id },
        ],
        quoteId: quote.id,
        customerId: user.id,
        vehicleMake: data.vehicleMake,
        vehicleModel: data.vehicleModel,
      },
    })

    return NextResponse.json(quote, { status: 201 })
  } catch (error) {
    console.error("Quote request creation error:", error)
    return NextResponse.json({ error: "Failed to create quote request" }, { status: 500 })
  }
}

