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
    const body = await request.json()
    const { reason, explanation } = body

    if (!reason || !explanation) {
      return NextResponse.json(
        { error: "Reason and explanation are required" },
        { status: 400 }
      )
    }

    // Get the service request with related data
    const serviceRequest = await prisma.mechanicServiceRequest.findUnique({
      where: { id: requestId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        mechanic: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            mechanicProfile: true,
          },
        },
        offers: {
          where: { status: "ACCEPTED" },
          take: 1,
        },
      },
    })

    if (!serviceRequest) {
      return NextResponse.json({ error: "Service request not found" }, { status: 404 })
    }

    if (serviceRequest.customerId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Only allow cancellation if status is PENDING, QUOTED, ACCEPTED, or IN_PROGRESS
    const cancellableStatuses = ["PENDING", "QUOTED", "ACCEPTED", "IN_PROGRESS"]
    if (!cancellableStatuses.includes(serviceRequest.status)) {
      return NextResponse.json(
        { error: `Cannot cancel service request with status: ${serviceRequest.status}` },
        { status: 400 }
      )
    }

    // Get accepted offer if exists
    const acceptedOffer = serviceRequest.offers[0]
    const totalAmount = acceptedOffer?.totalAmount || 0

    // Calculate commission (assuming 10% commission rate, can be made configurable)
    const commissionRate = 0.10
    const commission = totalAmount * commissionRate
    const refundAmount = totalAmount - commission // Customer gets refund minus commission

    // Update service request status
    const updatedRequest = await prisma.mechanicServiceRequest.update({
      where: { id: requestId },
      data: {
        status: "CANCELLED",
        metadata: {
          ...(serviceRequest.metadata as any || {}),
          cancellationReason: reason,
          cancellationExplanation: explanation,
          cancelledAt: new Date().toISOString(),
          cancelledBy: user.id,
          refundAmount,
          commissionDeducted: commission,
        },
      },
    })

    // If there's an accepted offer and payment was made, handle wallet refund
    if (acceptedOffer && totalAmount > 0) {
      // Get customer wallet
      let customerWallet = await prisma.wallet.findUnique({
        where: { userId: user.id },
      })

      if (!customerWallet) {
        // Create wallet if doesn't exist
        customerWallet = await prisma.wallet.create({
          data: {
            userId: user.id,
            balance: 0,
            currency: "NGN", // Default currency
          },
        })
      }

      // Refund to customer wallet (minus commission)
      const newBalance = customerWallet.balance + refundAmount

      await prisma.wallet.update({
        where: { id: customerWallet.id },
        data: {
          balance: newBalance,
        },
      })

      // Create transaction record for refund
      await prisma.transaction.create({
        data: {
          userId: user.id,
          walletId: customerWallet.id,
          type: "REFUND",
          amount: refundAmount,
          currency: customerWallet.currency,
          status: "COMPLETED",
          description: `Refund for cancelled service request ${requestId} (Commission deducted: ${commission})`,
          reference: `REF-${requestId}`,
          metadata: {
            serviceRequestId: requestId,
            originalAmount: totalAmount,
            commissionDeducted: commission,
            reason,
            explanation,
          },
        },
      })

      // Create transaction for commission (deducted, not refunded)
      await prisma.transaction.create({
        data: {
          userId: user.id,
          walletId: customerWallet.id,
          type: "COMMISSION",
          amount: -commission, // Negative for deduction
          currency: customerWallet.currency,
          status: "COMPLETED",
          description: `Commission deducted for cancelled service request ${requestId}`,
          reference: `COMM-${requestId}`,
          metadata: {
            serviceRequestId: requestId,
            commissionRate,
            originalAmount: totalAmount,
          },
        },
      })
    }

    // Notify mechanic about cancellation
    if (serviceRequest.mechanicId && serviceRequest.mechanic) {
      const mechanicName = serviceRequest.mechanic.mechanicProfile?.businessName || serviceRequest.mechanic.user?.name || "Mechanic"
      
      await NotificationBridge.sendNotification({
        userId: serviceRequest.mechanic.user.id,
        title: 'Service Request Cancelled',
        message: `Customer has cancelled service request. Reason: ${reason}`,
        type: 'SERVICE_CANCELLED',
        module: 'AUTO_PARTS',
        actionUrl: `/auto-parts/mechanics/service-requests/${requestId}`,
        data: {
          actionType: 'navigate',
          screen: 'MechanicServiceRequestDetails',
          params: [
            { name: 'serviceRequestId', value: requestId },
          ],
          reason,
          explanation,
        },
      })

      // Send socket notification
      const socketServer = getGlobalSocketServer()
      if (socketServer) {
        await socketServer.sendNotificationToUser(serviceRequest.mechanic.user.id, {
          type: 'service_cancelled',
          serviceRequestId: requestId,
          reason,
          explanation,
          customerName: user.name,
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: "Service request cancelled successfully",
      data: {
        request: updatedRequest,
        refundAmount: acceptedOffer ? refundAmount : 0,
        commissionDeducted: acceptedOffer ? commission : 0,
      },
    })
  } catch (error: any) {
    console.error("Cancel service request error:", error)
    return NextResponse.json(
      { error: "Failed to cancel service request", details: error.message },
      { status: 500 }
    )
  }
}

