import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
import { getGlobalSocketServer } from "@/lib/socket-server"

export async function POST(
  request: NextRequest,
  { params }: { params: { requestId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { requestId } = params

    // Get the service request
    const serviceRequest = await prisma.mechanicServiceRequest.findUnique({
      where: { id: requestId },
      include: {
        mechanic: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              }
            },
          }
        },
        customer: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    })

    if (!serviceRequest) {
      return NextResponse.json({ error: "Service request not found" }, { status: 404 })
    }

    // Verify customer owns the request
    if (serviceRequest.customerId !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    // Verify service is COMPLETED and not yet approved
    if (serviceRequest.status !== "COMPLETED") {
      return NextResponse.json({ 
        error: "Service request must be completed before approval" 
      }, { status: 400 })
    }

    const metadata = (serviceRequest.metadata as any) || {}
    if (metadata.customerApproved === true) {
      return NextResponse.json({ 
        error: "Service request already approved" 
      }, { status: 400 })
    }

    // Update service request to mark as approved
    const updatedRequest = await prisma.mechanicServiceRequest.update({
      where: { id: requestId },
      data: {
        metadata: {
          ...metadata,
          customerApproved: true,
          status: "COMPLETED",
          approvedAt: new Date().toISOString(),
        }
      }
    })

    // Release escrow: PENDING credits tied to this service request (order-based part jobs + quote-only jobs with no orderId)
    const orderId = metadata?.orderId as string | undefined
    try {
      await prisma.$transaction(async (tx) => {
        let pendingTransactions = await tx.walletTransaction.findMany({
          where: {
            status: "PENDING",
            type: "CREDIT",
            metadata: {
              path: ["serviceRequestId"],
              equals: requestId,
            },
          },
        })

        if (pendingTransactions.length === 0 && orderId) {
          const allPendingTransactions = await tx.walletTransaction.findMany({
            where: {
              orderId: orderId,
              status: "PENDING",
              type: "CREDIT",
            },
          })

          let filtered = allPendingTransactions.filter((wt) => {
            const wtMetadata = wt.metadata as any
            return wtMetadata?.serviceRequestId === requestId
          })
          if (filtered.length === 0 && allPendingTransactions.length > 0) {
            const ord = await tx.order.findUnique({
              where: { id: orderId },
              select: { module: true },
            })
            if (ord?.module === "AUTO_PARTS") {
              filtered = allPendingTransactions
            }
          }
          pendingTransactions = filtered
        }

        for (const transaction of pendingTransactions) {
          let wallet = await tx.wallet.findUnique({
            where: { userId: transaction.userId },
          })

          if (!wallet) {
            const cur = await tx.currency.findFirst({
              where: { isDefault: true },
              select: { code: true },
            })
            wallet = await tx.wallet.create({
              data: {
                userId: transaction.userId,
                balance: 0,
                currency: cur?.code || "NGN",
              },
            })
          }

          const updatedWallet = await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: {
                increment: transaction.amount,
              },
            },
          })

          await tx.walletTransaction.update({
            where: { id: transaction.id },
            data: {
              status: "COMPLETED",
              balance: updatedWallet.balance,
            },
          })
        }

        if (orderId) {
          await tx.orderTracking.create({
            data: {
              orderId: orderId,
              status: "DELIVERED",
              notes: `Service approved by customer`,
              timestamp: new Date(),
            },
          })
        }
      })
    } catch (error) {
      console.error("Error completing wallet transactions and order tracking:", error)
    }

    // Update PartRequest status to COMPLETED only when customer approves
    const partRequestId = metadata?.requestId || metadata?.partRequestId
    if (partRequestId) {
      try {
        await prisma.partRequest.update({
          where: { id: partRequestId },
          data: { status: "COMPLETED" }
        })
      } catch (error) {
        console.error("Error updating part request status:", error)
      }
    }

    const mechanicName = serviceRequest.mechanic?.businessName || 
                        serviceRequest.mechanic?.user?.name || "Mechanic"

    const quoteForSr = await prisma.mechanicQuote.findFirst({
      where: { serviceRequestId: requestId },
      select: { id: true, mechanicId: true },
    })

    let mechanicUserIdForFeedback: string | null =
      serviceRequest.mechanic?.user?.id ?? null
    if (!mechanicUserIdForFeedback && quoteForSr?.mechanicId) {
      mechanicUserIdForFeedback = quoteForSr.mechanicId
    }
    if (!mechanicUserIdForFeedback) {
      const fromOffer = await prisma.mechanicOffer.findFirst({
        where: { serviceRequestId: requestId, status: "ACCEPTED" },
        select: { mechanicId: true },
      })
      mechanicUserIdForFeedback = fromOffer?.mechanicId ?? null
    }
    if (!mechanicUserIdForFeedback) {
      const anyOffer = await prisma.mechanicOffer.findFirst({
        where: { serviceRequestId: requestId },
        orderBy: { updatedAt: "desc" },
        select: { mechanicId: true },
      })
      mechanicUserIdForFeedback = anyOffer?.mechanicId ?? null
    }

    const parentOrderIdForFeedback = orderId || `ap-sr:${requestId}`
    const feedbackSocketPayload = {
      type: "auto_parts_feedback_prompt" as const,
      parentOrderId: parentOrderIdForFeedback,
      customerId: serviceRequest.customerId,
      mechanicUserId: mechanicUserIdForFeedback,
      vendorUserIds: [] as string[],
      serviceRequestIds: [String(requestId)],
      source: "service_approved" as const,
    }

    // Notify customer to rate mechanic
    await NotificationBridge.sendNotification({
      userId: serviceRequest.customerId,
      title: 'Service Approved',
      message: `Thank you for approving! Please rate ${mechanicName} to complete the process.`,
      type: 'SERVICE_COMPLETED',
      module: 'AUTO_PARTS',
      actionUrl: `/auto-parts/service-requests/${requestId}`,
      data: {
        actionType: 'navigate',
        screen: 'CustomerServiceRequestDetails',
        params: [
          { name: 'requestId', value: requestId },
          { name: 'showRating', value: true }, // Flag to show rating modal after approval
        ],
        mechanicId: serviceRequest.mechanicId,
      }
    })

    // Notify mechanic (use resolved user id — quote jobs may not have MechanicProfile on the service request)
    if (mechanicUserIdForFeedback) {
      await NotificationBridge.sendNotification({
        userId: mechanicUserIdForFeedback,
        title: 'Service Approved',
        message: `${user.name || 'Customer'} has approved your completed service.`,
        type: 'SERVICE_COMPLETED',
        module: 'AUTO_PARTS',
        actionUrl: `/auto-parts/mechanics/service-requests/${requestId}`,
        data: {
          actionType: 'navigate',
          screen: 'MechanicServiceRequestDetails',
          params: [
            { name: 'serviceRequestId', value: requestId },
          ],
        }
      })
    }

    try {
      const socketServer = getGlobalSocketServer()
      await socketServer.sendNotificationToUser(serviceRequest.customerId, feedbackSocketPayload)
      if (mechanicUserIdForFeedback) {
        await socketServer.sendNotificationToUser(mechanicUserIdForFeedback, feedbackSocketPayload)
      }
      const refreshPayload = {
        type: "auto_parts_service_request_refresh" as const,
        serviceRequestId: String(requestId),
        event: "approved" as const,
      }
      await socketServer.sendNotificationToUser(serviceRequest.customerId, refreshPayload)
      if (mechanicUserIdForFeedback) {
        await socketServer.sendNotificationToUser(mechanicUserIdForFeedback, refreshPayload)
      }
      socketServer.emitAutoPartsServiceRequestRoom(String(requestId), {
        ...refreshPayload,
        customerApproved: true,
      })
      if (quoteForSr?.id) {
        socketServer.emitAutoPartsQuoteRoom(quoteForSr.id, {
          type: "service_request_approved",
          serviceRequestId: String(requestId),
          customerApproved: true,
          event: "approved",
        })
        /** Same room as quote details so mechanic + customer merge MECHANIC_RATE_CUSTOMER / CUSTOMER_RATE_MECHANIC if per-user emit missed. */
        socketServer.emitAutoPartsQuoteRoom(quoteForSr.id, {
          ...feedbackSocketPayload,
          quoteId: quoteForSr.id,
        })
      }
    } catch (e) {
      console.error("Approve service request socket emit:", e)
    }

    return NextResponse.json({
      success: true,
      data: {
        serviceRequest: updatedRequest,
        message: "Service approved successfully. Please rate the mechanic.",
        feedbackContext: {
          parentOrderId: parentOrderIdForFeedback,
          customerId: serviceRequest.customerId,
          mechanicUserId: mechanicUserIdForFeedback,
          vendorUserIds: [] as string[],
          serviceRequestIds: [String(requestId)],
        },
      }
    })

  } catch (error: any) {
    console.error("Approve service request error:", error)
    return NextResponse.json(
      { error: "Failed to approve service request", details: error.message },
      { status: 500 }
    )
  }
}