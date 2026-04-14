import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"

export async function PUT(
  request: NextRequest,
  { params }: { params: { requestId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { requestId } = params

    // Find the part request
    const partRequest = await prisma.partRequest.findUnique({
      where: { id: requestId },
      include: {
        offers: {
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    })

    if (!partRequest) {
      return NextResponse.json({ error: "Part request not found" }, { status: 404 })
    }

    if (partRequest.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    if (partRequest.status !== "OPEN") {
      return NextResponse.json(
        { error: "Only open requests can be cancelled" },
        { status: 400 }
      )
    }

    // Update request status to CANCELLED
    const updatedRequest = await prisma.partRequest.update({
      where: { id: requestId },
      data: {
        status: "CANCELLED",
      },
    })

    // Notify all vendors who submitted offers
    const vendorIds = partRequest.offers.map(offer => offer.vendorId)
    if (vendorIds.length > 0) {
      try {
        await NotificationBridge.sendBulkNotifications(vendorIds, {
          title: "Part Request Cancelled",
          message: `The part request for ${partRequest.partName} has been cancelled by the customer`,
          type: "AUTO_PARTS_REQUEST",
          module: "AUTO_PARTS",
          data: {
            requestId,
            partName: partRequest.partName,
            status: "CANCELLED",
          },
        })
      } catch (notifError) {
        console.error("Notification error:", notifError)
      }
    }

    return NextResponse.json({
      success: true,
      message: "Part request cancelled successfully",
      request: updatedRequest,
    })
  } catch (error) {
    console.error("Cancel part request error:", error)
    return NextResponse.json({ error: "Failed to cancel part request" }, { status: 500 })
  }
}

