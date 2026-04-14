import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
// import { pingAutoPartsRefresh } from "@/lib/autoPartsSocket"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    // Mobile client sends serviceRequestId; legacy callers used requestId — both mean MechanicServiceRequest.id
    const serviceRequestFilter =
      searchParams.get("serviceRequestId") || searchParams.get("requestId")
    const status = searchParams.get("status")

    const where: any = {}

    if (user.role === "CUSTOMER") {
      if (!serviceRequestFilter) {
        return NextResponse.json({ offers: [] })
      }
      where.serviceRequestId = serviceRequestFilter
    } else if (user.role === "MECHANIC") {
      where.mechanicId = user.id
      if (serviceRequestFilter) {
        where.serviceRequestId = serviceRequestFilter
      }
    }

    if (status) {
      where.status = status
    }

    

    const offers = await prisma.mechanicOffer.findMany({
      where,
      include: {
        serviceRequest: {
          select: {
            vehicleMake: true,
            vehicleModel: true,
            vehicleYear: true,
            issueDescription: true,
            status: true,
            metadata: true,
            customer: {
              select: {
                name: true,
                phone: true,
              },
            },
          },
        },
        mechanic: {
          select: {
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
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ offers })
  } catch (error) {
    console.error("Mechanic offers fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch offers" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "MECHANIC") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()


    // Validate required fields
    if (!data.serviceRequestId || !data.partsList || !data.serviceCharges || !data.totalAmount) {
      return NextResponse.json(
        { error: "serviceRequestId, partsList, serviceCharges, and totalAmount are required" },
        { status: 400 }
      )
    }

    // Check if service request exists and is still pending
    const serviceRequest = await prisma.mechanicServiceRequest.findUnique({
      where: { id: data.serviceRequestId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!serviceRequest) {
      return NextResponse.json({ error: "Service request not found" }, { status: 404 })
    }

    if (serviceRequest.status !== "PENDING" && serviceRequest.status !== "QUOTED") {
      return NextResponse.json(
        { error: "This service request is no longer accepting offers" },
        { status: 400 }
      )
    }

    // Check if mechanic already submitted an offer
    const existingOffer = await prisma.mechanicOffer.findFirst({
      where: {
        serviceRequestId: data.serviceRequestId,
        mechanicId: user.id,
        status: { in: ["PENDING", "ACCEPTED"] },
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

    // Create offer
    const offer = await prisma.mechanicOffer.create({
      data: {
        serviceRequestId: data.serviceRequestId,
        mechanicId: user.id,
        partsList: data.partsList,
        serviceCharges: parseFloat(data.serviceCharges),
        diagnosticFee: data.diagnosticFee ? parseFloat(data.diagnosticFee) : null,
        totalAmount: parseFloat(data.totalAmount),
        estimatedTime: data.estimatedTime || null,
        warranty: data.warranty || null,
        notes: data.notes || null,
        expiresAt,
        status: "PENDING",
      },
      include: {
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

    // Update service request status to QUOTED if it was PENDING
    if (serviceRequest.status === "PENDING") {
      await prisma.mechanicServiceRequest.update({
        where: { id: data.serviceRequestId },
        data: { status: "QUOTED" },
      })
    }

    // NOTE: PartRequest updates are handled separately in the part request flow
    // This endpoint is ONLY for mechanic service quotes (MechanicOffer)
    // Do NOT mix PartRequest logic here - service quotes are independent of part requests

    const meta = (serviceRequest as any).metadata as Record<string, unknown> | null | undefined
    const partRequestId =
      typeof meta?.requestId === "string" ? meta.requestId : undefined

    // emitAutoPartsMechanicOfferSocket(serviceRequest.customer.id, {
    //   offerId: offer.id,
    //   serviceRequestId: data.serviceRequestId,
    //   partRequestId: partRequestId ?? null,
    // })

    // Notify customer
    await NotificationBridge.sendBulkNotifications(
      [serviceRequest.customer.id],
      {
        title: "New Mechanic Offer",
        message: `A mechanic has submitted an offer for your ${serviceRequest.vehicleMake} ${serviceRequest.vehicleModel} service request.`,
        type: "MECHANIC_OFFER_RECEIVED",
        module: "AUTO_PARTS",
        actionUrl: `/auto-parts/mechanics/offers/${offer.id}`,
        data: {
          actionType: "navigate",
          screen: 'mechanic-offer-details',
          params: [
            {
              name: 'offerId',
              value: offer.id,
            },
          ],
        },
      }
    )

    return NextResponse.json(offer, { status: 201 })
  } catch (error) {
    console.error("Mechanic offer creation error:", error)
    return NextResponse.json({ error: "Failed to create offer" }, { status: 500 })
  }
}


