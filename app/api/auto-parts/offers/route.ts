import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { enrichOffersWithLinkedProducts } from "@/lib/enrich-part-offers-products"

const DELIVERY_AVAILABLE_NOW = "AVAILABLE_NOW"

function isValidDeliveryTime(raw: unknown): boolean {
  if (typeof raw !== "string") return false
  const value = raw.trim()
  if (!value) return false
  if (value === DELIVERY_AVAILABLE_NOW) return true
  const dt = new Date(value)
  return Number.isFinite(dt.getTime()) && dt.getTime() > Date.now()
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()

    // Validate required fields
    if (!data.requestId || !data.price || !data.condition || !data.deliveryTime) {
      return NextResponse.json(
        { error: "requestId, price, condition, and deliveryTime are required" },
        { status: 400 }
      )
    }
    if (!isValidDeliveryTime(data.deliveryTime)) {
      return NextResponse.json(
        { error: "deliveryTime must be AVAILABLE_NOW or a valid future ISO datetime" },
        { status: 400 }
      )
    }

    // Check if request exists and is still open
    const partRequest = await prisma.partRequest.findUnique({
      where: { id: data.requestId },
    })

    if (!partRequest) {
      return NextResponse.json({ error: "Part request not found" }, { status: 404 })
    }

    if (partRequest.status !== "OPEN") {
      return NextResponse.json(
        { error: "This part request is no longer accepting offers" },
        { status: 400 }
      )
    }

    // Check if vendor already submitted an offer for this request
    const existingOffer = await prisma.partOffer.findFirst({
      where: {
        requestId: data.requestId,
        vendorId: user.id,
      },
    })

    if (existingOffer) {
      return NextResponse.json(
        { error: "You have already submitted an offer for this request" },
        { status: 400 }
      )
    }

    // Set expiry date (default 3 days from now)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 3)

    // Validate mechanic if provided
    if (data.mechanicId) {
      const mechanic = await prisma.user.findUnique({
        where: { id: data.mechanicId },
        include: { mechanicProfile: true },
      })
      if (!mechanic || mechanic.role !== "MECHANIC" || !mechanic.mechanicProfile) {
        return NextResponse.json(
          { error: "Invalid mechanic selected" },
          { status: 400 }
        )
      }
    }

    // Check if this is the first offer for this request
    const existingOffersCount = await prisma.partOffer.count({
      where: { requestId: data.requestId }
    })

    // Create offer
    const offer = await prisma.partOffer.create({
      data: {
        requestId: data.requestId,
        vendorId: user.id,
        partId: data.partId || null,
        mechanicId: data.mechanicId || null,
        price: parseFloat(data.price),
        condition: data.condition,
        availability: data.availability || "In Stock",
        description: data.description || null,
        images: data.images || null,
        warranty: data.warranty || null,
        deliveryTime: data.deliveryTime,
        status: "PENDING",
        expiresAt,
      },
      include: {
        request: {
          select: {
            partName: true,
            vehicleBrand: true,
            vehicleModel: true,
          },
        },
        vendor: {
          select: {
            name: true,
            vendorProfile: {
              select: {
                businessName: true,
                logo: true,
                user:true
              },
              
            },
            reviews: true,
            
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
                totalReviews: true,
                hourlyRate: true,
              },
            },
          },
        },
      },
    })

    // Get customer info for notification
    const customer = await prisma.user.findUnique({
      where: { id: partRequest.userId },
      select: { name: true, email: true }
    })

    // Notify customer about new offer using NotificationBridge
    try {
      await NotificationBridge.sendNotification({
        userId: partRequest.userId,
        title: "New Offer Received",
        message: `${user.name || "A vendor"} submitted an offer for ${partRequest.partName} - ${partRequest.vehicleBrand} ${partRequest.vehicleModel}`,
        type: "AUTO_PARTS_OFFER",
        module: "AUTO_PARTS",
        data: {
            actionType: "navigate",
            screen: 'PartRequestOffers',
            params: [
              {
                name: 'requestId',  
                value: partRequest.id,
              },
            
            ],
          },
        actionUrl: `/auto-parts/requests/${data.requestId}/offers`,
        // imageUrl: offer.images && Array.isArray(offer.images) && offer.images.length > 0 ? offer.images[0] : undefined,
      })
    } catch (notifError) {
      console.error("Notification error:", notifError)
      // Don't fail the offer creation if notification fails
    }

    // Update part request status to OFFERS_RECEIVED if this is the first offer
    if (existingOffersCount === 0 && partRequest.status === "OPEN") {
      await prisma.partRequest.update({
        where: { id: data.requestId },
        data: { status: "OFFERS_RECEIVED" }
      })
    }

    // Also notify vendor (confirmation)
    try {
      await NotificationBridge.sendNotification({
        userId: user.id,
        title: "Offer Submitted",
        message: `Your offer for ${partRequest.partName} has been submitted successfully`,
        type: "AUTO_PARTS_OFFER",
        module: "AUTO_PARTS",
        data: {
          requestId: data.requestId,
          offerId: offer.id,
          status: "PENDING",
        },
      })
    } catch (notifError) {
      console.error("Vendor notification error:", notifError)
    }

    try {
      getGlobalSocketServer().emitAutoPartsRequestRoom(data.requestId, {
        type: "new_offer",
        offerId: offer.id,
        vendorId: user.id,
      })
    } catch (e) {
      console.error("auto_parts socket emit:", e)
    }

    return NextResponse.json(offer, { status: 201 })
  } catch (error) {
    console.error("Part offer creation error:", error)
    return NextResponse.json({ error: "Failed to create part offer" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const requestId = searchParams.get("requestId")
    const status = searchParams.get("status")

    const where: any = {}

    if (user.role === "VENDOR") {
      where.vendorId = user.id
    } else if (user.role === "CUSTOMER") {
      // Customers can see offers for their requests
      where.request = {
        userId: user.id,
      }
    }

    if (requestId) {
      where.requestId = requestId
    }

    if (status) {
      where.status = status
    }

    const offers = await prisma.partOffer.findMany({
      where,
      include: {
        request: {
          select: {
            partName: true,
            vehicleBrand: true,
            vehicleModel: true,
            vehicleYear: true,
            urgency: true,
            maxBudget: true,
          },
        },
        vendor: {
          select: {
            name: true,
            phone: true,
            email: true,
            autoPartsStore: {
              select: {
                rating: true,
                totalReviews: true,
                storeName: true,
              },
            },
            vendorProfile: {
              select: {
                businessName: true,
                logo: true,
                address: true,
                city: true,
                state: true,
                latitude: true,
                longitude: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                    addresses: {
                      where: { isDefault: true },
                      select: { latitude: true, longitude: true, city: true },
                    },
                  },
                },
              },
            },
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
                totalReviews: true,
                hourlyRate: true,
                address: true,
                city: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const offersWithProducts = await enrichOffersWithLinkedProducts(offers)

    return NextResponse.json({ offers: offersWithProducts })
  } catch (error) {
    console.error("Part offers fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch part offers" }, { status: 500 })
  }
}

