import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "MECHANIC") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { serviceRequestId, additionalParts } = body

    if (!serviceRequestId || !additionalParts) {
      return NextResponse.json(
        { error: "serviceRequestId and additionalParts are required" },
        { status: 400 }
      )
    }

    // Get the service request
    const serviceRequest = await prisma.mechanicServiceRequest.findUnique({
      where: { id: serviceRequestId },
      include: {
        customer: true,
      },
    })

    if (!serviceRequest) {
      return NextResponse.json({ error: "Service request not found" }, { status: 404 })
    }

    // Update metadata with additional parts request
    const metadata = (serviceRequest.metadata as any) || {}
    metadata.additionalPartsRequest = additionalParts
    metadata.additionalPartsRequestedAt = new Date().toISOString()
    metadata.additionalPartsRequestedBy = user.id

    await prisma.mechanicServiceRequest.update({
      where: { id: serviceRequestId },
      data: { metadata },
    })

    // Notify customer about additional parts request
    await NotificationBridge.sendNotification({
      userId: serviceRequest.customerId,
      title: "Additional Parts Requested",
      message: `Mechanic has requested additional parts: ${additionalParts}`,
      type: "MECHANIC_ADDITIONAL_PARTS_REQUEST",
      module: "AUTO_PARTS",
      actionUrl: `/auto-parts/requests/${serviceRequestId}`,
      data: {
        actionType: "navigate",
        screen: "part-request-offers",
        params: {
          requestId: serviceRequestId,
        },
        additionalParts: additionalParts,
      },
    })

    return NextResponse.json({
      success: true,
      message: "Additional parts request sent to customer",
    })
  } catch (error: any) {
    console.error("Request additional parts error:", error)
    return NextResponse.json(
      { error: "Failed to request additional parts", details: error.message },
      { status: 500 }
    )
  }
}



