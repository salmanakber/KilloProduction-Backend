import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    const { requestId, price, condition, availability, description, images, warranty, deliveryTime } = data

    // Validate required fields
    if (!requestId || !price || !condition || !availability || !deliveryTime) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Check if request exists and is open
    const partRequest = await prisma.partRequest.findUnique({
      where: { id: requestId },
    })

    if (!partRequest || partRequest.status !== "OPEN") {
      return NextResponse.json({ error: "Part request not found or not open" }, { status: 404 })
    }

    // Check if vendor already submitted an offer
    const existingOffer = await prisma.partOffer.findFirst({
      where: {
        requestId,
        vendorId: user.id,
      },
    })

    if (existingOffer) {
      return NextResponse.json({ error: "You have already submitted an offer for this request" }, { status: 400 })
    }

    // Set expiry date (7 days from now)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const offer = await prisma.partOffer.create({
      data: {
        requestId,
        vendorId: user.id,
        price: Number.parseFloat(price),
        condition,
        availability,
        description,
        images: images || [],
        warranty,
        deliveryTime,
        expiresAt,
      },
      include: {
        vendor: {
          select: {
            name: true,
            autoPartsStore: {
              select: {
                storeName: true,
                rating: true,
                isVerified: true,
              },
            },
          },
        },
      },
    })

    // Update request status to show offers received
    await prisma.partRequest.update({
      where: { id: requestId },
      data: { status: "OFFERS_RECEIVED" },
    })

    // Send notification to customer
    await prisma.notification.create({
      data: {
        userId: partRequest.userId,
        title: "New Offer Received",
        message: `You received a new offer for your part request: ${partRequest.partName}`,
        type: "ORDER_UPDATE",
        module: "AUTO_PARTS",
        data: {
          requestId,
          offerId: offer.id,
        },
      },
    })

    return NextResponse.json(offer, { status: 201 })
  } catch (error) {
    console.error("Offer creation error:", error)
    return NextResponse.json({ error: "Failed to create offer" }, { status: 500 })
  }
}
