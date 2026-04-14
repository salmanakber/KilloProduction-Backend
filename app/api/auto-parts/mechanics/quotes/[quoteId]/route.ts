import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
import { emitAutoPartsQuoteSocket } from "@/lib/auto-parts-realtime"

// GET - Get a specific quote
export async function GET(
  request: NextRequest,
  { params }: { params: { quoteId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { quoteId } = params

    const quote = await prisma.mechanicQuote.findUnique({
      where: { id: quoteId },
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
                hourlyRate: true,
              },
            },
          },
        },
        serviceRequest: {
          select: {
            id: true,
            status: true,
            metadata: true,
          },
        },
      },
    })

    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    }

    // Verify user has access
    if (user.role === "CUSTOMER" && quote.customerId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }
    if (user.role === "MECHANIC" && quote.mechanicId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    return NextResponse.json({ quote })
  } catch (error) {
    console.error("Get quote error:", error)
    return NextResponse.json({ error: "Failed to fetch quote" }, { status: 500 })
  }
}

// PUT - Mechanic submits quote details
export async function PUT(
  request: NextRequest,
  { params }: { params: { quoteId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "MECHANIC") {
      return NextResponse.json({ error: "Unauthorized - Mechanic access only" }, { status: 401 })
    }

    const { quoteId } = params
    const data = await request.json()

    // Validate required fields
    if (!data.serviceCharges || !data.totalAmount) {
      return NextResponse.json(
        { error: "serviceCharges and totalAmount are required" },
        { status: 400 }
      )
    }

    // Check if quote exists and belongs to this mechanic
    const quote = await prisma.mechanicQuote.findUnique({
      where: { id: quoteId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    }

    if (quote.mechanicId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    if (quote.status !== "PENDING") {
      return NextResponse.json(
        { error: `Cannot update quote with status ${quote.status}` },
        { status: 400 }
      )
    }

    // Update quote with mechanic's pricing
    const updatedQuote = await prisma.mechanicQuote.update({
      where: { id: quoteId },
      data: {
        partsList: data.partsList || null,
        serviceCharges: parseFloat(data.serviceCharges),
        diagnosticFee: data.diagnosticFee ? parseFloat(data.diagnosticFee) : null,
        totalAmount: parseFloat(data.totalAmount),
        estimatedTime: data.estimatedTime || null,
        warranty: data.warranty || null,
        notes: data.notes || null,
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

    // Update quote status to SUBMITTED
    const finalQuote = await prisma.mechanicQuote.update({
      where: { id: quoteId },
      data: { status: "SUBMITTED" },
    })

    emitAutoPartsQuoteSocket(quote.customerId, {
      quoteId: updatedQuote.id,
      status: "SUBMITTED",
      event: "quote_submitted",
      mechanicId: user.id,
    })

    // Notify customer
    await NotificationBridge.sendNotification({
      userId: quote.customerId,
      title: "Quote Received",
      message: `${updatedQuote.mechanic.mechanicProfile?.businessName || updatedQuote.mechanic.name} has submitted a quote for your ${quote.vehicleMake} ${quote.vehicleModel}`,
      type: "MECHANIC_QUOTE_RECEIVED",
      module: "AUTO_PARTS",
      actionUrl: `/auto-parts/quotes/${updatedQuote.id}`,
      data: {
        actionType: "navigate",
        screen: 'CustomerQuoteDetails',
        params: [
          { name: 'quoteId', value: updatedQuote.id },
        ],
        quoteId: updatedQuote.id,
        mechanicId: user.id,
        totalAmount: updatedQuote.totalAmount,
      },
    })

    return NextResponse.json({ quote: updatedQuote })
  } catch (error) {
    console.error("Update quote error:", error)
    return NextResponse.json({ error: "Failed to update quote" }, { status: 500 })
  }
}

