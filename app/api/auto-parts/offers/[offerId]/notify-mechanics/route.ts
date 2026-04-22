import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getAutoPartsMechanicPickupPricePerKm } from "@/lib/auto-parts-mechanic-pickup-settings"
import { NotificationBridge } from "@/lib/notification-bridge"
import { emitAutoPartsServiceRequestInviteSocket } from "@/lib/auto-parts-realtime"

export async function POST(
  request: NextRequest,
  { params }: { params: { offerId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { offerId } = params
    const body = await request.json()
    const { mechanicIds, requestId, systemPick } = body
  

    if (!mechanicIds || !Array.isArray(mechanicIds) || mechanicIds.length === 0) {
      
      return NextResponse.json({ error: "Mechanic IDs are required" }, { status: 400 })
    }

    if (mechanicIds.length > 5) {
      
      return NextResponse.json({ error: "Maximum 5 mechanics can be selected" }, { status: 400 })
    }
    
    if (mechanicIds.length < 3) {
      
      return NextResponse.json({ error: "Minimum 3 mechanics must be selected" }, { status: 400 })
    }

    // Get the offer and request
    const offer = await prisma.partOffer.findUnique({
      where: { id: offerId },
      include: {
        request: {
          include: {
            user: true
          }
        },
        vendor: {
          include: {
            vendorProfile: {
              select: {
                businessName: true,
                latitude: true,
                longitude: true,
                address: true
              }
            }
          }
        }
      }
    })

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    }

    // Verify customer owns the request
    if (offer.request.userId !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    // Get customer address
    const customerAddress = await prisma.address.findFirst({
      where: { userId: user.id, isDefault: true }
    })

    if (!customerAddress) {
      
      return NextResponse.json({ error: "Customer address not found" }, { status: 400 })
    }

    // Get vendor address
    const vendorLat = offer.vendor.vendorProfile?.latitude
    const vendorLon = offer.vendor.vendorProfile?.longitude
    const vendorAddress = offer.vendor.vendorProfile?.address
    

    if (!vendorLat || !vendorLon) {
      return NextResponse.json({ error: "Vendor location not available" }, { status: 400 })
    }

    // Calculate distance from vendor to customer
    if (!customerAddress.latitude || !customerAddress.longitude) {
      return NextResponse.json({ error: "Customer location not available" }, { status: 400 })
    }
    
    const distance = calculateDistance(
      vendorLat,
      vendorLon,
      customerAddress.latitude,
      customerAddress.longitude
    )

    const pricePerKm = await getAutoPartsMechanicPickupPricePerKm()
    const pickupFee = distance * pricePerKm

    // Collect all mechanic User IDs to store in metadata for resend functionality
    const allMechanicUserIds: string[] = []
    const skippedMechanicIds: string[] = []

    // Create mechanic service requests for each selected mechanic
    const serviceRequests = await Promise.all(
      mechanicIds.map(async (mechanicId: string) => {
        // Check if mechanic exists
        const mechanic = await prisma.user.findUnique({
          where: { id: mechanicId },
          include: { mechanicProfile: true }
        })

        if (!mechanic || mechanic.role !== "MECHANIC" || !mechanic.mechanicProfile || mechanic.mechanicProfile.length === 0) {
          throw new Error(`Invalid mechanic: ${mechanicId}`)
        }

        // Store User.id for metadata
        allMechanicUserIds.push(mechanic.id)

        // Get MechanicProfile ID (User.mechanicProfile is an array, get the first one)
        const mechanicProfile = mechanic.mechanicProfile[0]
        const mechanicProfileId = mechanicProfile.id

        // Skip if already invited for this request+offer pair
        const existingForMechanic = await prisma.mechanicServiceRequest.findFirst({
          where: {
            customerId: user.id,
            mechanicId: mechanicProfileId,
            metadata: {
              path: ["offerId"],
              equals: offerId,
            },
          } as any,
          select: { id: true },
        })
        if (existingForMechanic) {
          skippedMechanicIds.push(mechanic.id)
          return null
        }

        // Create service request with all necessary fields from PartRequest
        // Note: Each mechanic gets their own service request (one mechanicId per request)
        // The 'type' field exists in schema but Prisma client may need regeneration
        const serviceRequest = await prisma.mechanicServiceRequest.create({
          data: {
            customerId: user.id,
            mechanicId: mechanicProfileId, // Use MechanicProfile.id, not User.id
            vehicleMake: offer.request.vehicleBrand,
            vehicleModel: offer.request.vehicleModel,
            vehicleYear: offer.request.vehicleYear,
            // @ts-ignore - type field exists in schema but Prisma client types may need regeneration
            type: "PICK_DELIVREY_AND_SERVICE", // Set type for part request service (pickup, delivery, and service)
            issueDescription: offer.request.description || `Install ${offer.request.partName} for ${offer.request.vehicleBrand} ${offer.request.vehicleModel}`,
            diagnosedIssues: offer.request.images ? { 
              partRequest: true,
              partName: offer.request.partName,
              partType: offer.request.partType,
              images: offer.request.images,
              urgency: offer.request.urgency,
            } : {},
            recommendedParts: [{
              name: offer.request.partName,
              type: offer.request.partType,
              condition: offer.request.preferredCondition || "NEW",
              maxBudget: offer.request.maxBudget,
            }],
            customerAddress: `${customerAddress.street}, ${customerAddress.city}`,
            customerLatitude: customerAddress.latitude,
            customerLongitude: customerAddress.longitude,
            customerCity: customerAddress.city || "Unknown",
            urgency: offer.request.urgency || "MEDIUM",
            images: offer.request.images ? offer.request.images : undefined,
            status: "PENDING",
            // Store order and offer info in metadata
            metadata: {
              orderId: null, // Will be set when order is created
              offerId: offerId,
              requestId: requestId,
              vendorId: offer.vendorId,
              partName: offer.request.partName,
              partType: offer.request.partType,
              vendorLatitude: vendorLat,
              vendorLongitude: vendorLon,
              vendorAddress: vendorAddress,
              pickupDistance: distance,
              pickupFee: pickupFee,
              pricePerKm,
              partOfferPrice: offer.price,
              mechanicUserId: mechanic.id, // Store User.id for this specific mechanic
            }
          }
        })

        // Notify mechanic (use User.id for notification, not MechanicProfile.id)
        await NotificationBridge.sendBulkNotifications(
          [mechanic.id], // Use User.id for notifications
          {
            title: "New Service Request",
            message: `You've been selected to install ${offer.request.partName} for a customer. Submit your offer now!`,
            type: "MECHANIC_SERVICE_REQUEST",
            module: "AUTO_PARTS",
            actionUrl: `/auto-parts/mechanics/service-requests/${serviceRequest.id}`,
            data: {
              actionType: "navigate",
              screen: 'mechanic-service-request',
              params: [
                {
                  name: 'serviceRequestId',
                  value: serviceRequest.id,
                },
              ],
            },
          }
        )

        emitAutoPartsServiceRequestInviteSocket(mechanic.id, {
          serviceRequestId: serviceRequest.id,
          partRequestId: typeof requestId === "string" ? requestId : undefined,
          offerId,
        })

        return serviceRequest
      })
    )

    // Update all service requests to include all mechanic User IDs in metadata for resend functionality
    // This allows frontend to easily get all User IDs when resending
    await Promise.all(
      serviceRequests.filter(Boolean).map(async (sr: any) => {
        const currentMetadata = (sr as any).metadata as any
        await prisma.mechanicServiceRequest.update({
          where: { id: sr.id },
          data: {
            // @ts-ignore - metadata field exists in schema
            metadata: {
              ...(currentMetadata || {}),
              mechanicUserIds: allMechanicUserIds, // Store all User IDs for resend
              systemPickEnabled: Boolean(systemPick),
            }
          }
        })
      })
    )

    const createdServiceRequests = serviceRequests.filter(Boolean) as NonNullable<(typeof serviceRequests)[number]>[]
    if (createdServiceRequests.length === 0) {
      return NextResponse.json(
        {
          error: "No new nearby mechanics to notify",
          details: "All selected mechanics already received this request",
          skippedMechanicIds,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `${createdServiceRequests.length} mechanic(s) notified successfully`,
      serviceRequests: createdServiceRequests.map(sr => ({ id: sr.id })),
      pickupFee: pickupFee,
      distance: distance,
      skippedMechanicIds,
    })

  } catch (error: any) {
    console.error("Notify mechanics error:", error)
    return NextResponse.json(
      { error: "Failed to notify mechanics", details: error.message },
      { status: 500 }
    )
  }
}

// Helper function to calculate distance between two points (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

