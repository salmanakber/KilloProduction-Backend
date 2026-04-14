import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"
import { broadcastAutoPartsOrderEvent } from "@/lib/auto-parts-order-socket-broadcast"

export async function PUT(
  request: NextRequest,
  { params }: { params: { requestId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { requestId } = params
    const body = await request.json()
    const { status, latitude, longitude, notes } = body

    if (!status) {
      return NextResponse.json({ error: "Status is required" }, { status: 400 })
    }

    // Get the service request
    const serviceRequest = await prisma.mechanicServiceRequest.findUnique({
      where: { id: requestId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          }
        },
        mechanic: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        },
        offers: {
          where: { status: "ACCEPTED" },
          take: 1
        }
      }
    })

    if (!serviceRequest) {
      return NextResponse.json({ error: "Service request not found" }, { status: 404 })
    }


    // Verify authorization
    if (user.role === "MECHANIC" && serviceRequest.mechanic && serviceRequest.mechanic.userId !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }
    
    if (user.role === "CUSTOMER" && serviceRequest.customerId !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    // Validate status transition
    const validStatuses = ["PENDING", "QUOTED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "REJECTED"]
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    // Part-request + vendor + order (PICK_DELIVREY_AND_SERVICE): pickup + delivery QR rules stay as before.
    // Marketplace quote / direct mechanic jobs (ONLY_SERVICE): no store pickup — mechanic can complete without those gates.
    if (status === "COMPLETED" && user.role === "MECHANIC") {
      const metadata = (serviceRequest.metadata as any) || {}
      const requiresStoreCompletionGates = serviceRequest.type === "PICK_DELIVREY_AND_SERVICE"

      if (requiresStoreCompletionGates) {
        if (!metadata.partsPickedUp) {
          return NextResponse.json({
            error:
              "Cannot mark as completed until pickup is confirmed: the mechanic must scan the store pickup QR, or the vendor must verify the handover code.",
          }, { status: 400 })
        }
        /** AUTO_PARTS + linked order: must scan customer delivery QR first (root order DELIVERED). */
        const oid = metadata.orderId as string | undefined
        if (oid) {
          const row = await prisma.order.findFirst({
            where: { id: oid, module: "AUTO_PARTS" },
            select: { id: true, status: true, isChildOrder: true, childId: true },
          })
          if (row) {
            const parentPk = row.isChildOrder && row.childId ? row.childId : row.id
            const parentOrder = await prisma.order.findUnique({
              where: { id: parentPk },
              select: { status: true },
            })
            if (parentOrder && parentOrder.status !== "DELIVERED") {
              return NextResponse.json(
                {
                  error:
                    "Finish at the customer first: scan the delivery QR from their order screen. The order must show as delivered before you can mark this job complete.",
                },
                { status: 400 }
              )
            }
          }
        }
      }
    }

    // Prepare update data
    const updateData: any = {
      status: status as any,
    }

    // If mechanic is marking as COMPLETED, auto-approve customer only for pickup+delivery jobs when the order is already delivered.
    // ONLY_SERVICE / quote marketplace jobs always require an explicit customer "Confirm done" (/approve), even if metadata has a stray orderId.
    if (status === "COMPLETED" && user.role === "MECHANIC") {
      const metadata = (serviceRequest.metadata as any) || {}
      let customerApproved = false
      const requiresStoreCompletionGates = serviceRequest.type === "PICK_DELIVREY_AND_SERVICE"
      const oid = metadata.orderId as string | undefined
      if (requiresStoreCompletionGates && oid) {
        const row = await prisma.order.findFirst({
          where: { id: oid, module: "AUTO_PARTS" },
          select: { id: true, status: true, isChildOrder: true, childId: true },
        })
        if (row) {
          const parentPk = row.isChildOrder && row.childId ? row.childId : row.id
          const parentOrder = await prisma.order.findUnique({
            where: { id: parentPk },
            select: { status: true },
          })
          if (parentOrder?.status === "DELIVERED") {
            customerApproved = true
          }
        }
      }
      updateData.metadata = {
        ...metadata,
        customerApproved,
        completedAt: new Date().toISOString(),
      }
    }

    // Update service request status
    const updatedRequest = await prisma.mechanicServiceRequest.update({
      where: { id: requestId },
      data: updateData
    })

    // Update mechanic location if provided
    if (user.role === "MECHANIC" && latitude && longitude) {
      await prisma.mechanicProfile.update({
        where: { userId: user.id },
        data: {
          latitude: latitude,
          longitude: longitude,
        }
      })
    }

    // Send notifications based on status
    const socketServer = getGlobalSocketServer()
    const metadata = serviceRequest.metadata as any
    const mechanicName = (serviceRequest.mechanic as any)?.user?.name || "Mechanic"

    // Fetch vendor info if status is IN_PROGRESS and orderId exists
    let vendorInfo: any = null
    if (status === "IN_PROGRESS" && metadata?.orderId) {
      try {
        const order = await prisma.order.findUnique({
          where: { id: metadata.orderId },
          include: {
            vendor: {
              include: {
                vendorProfile: {
                  select: {
                    businessName: true,
                    address: true,
                    city: true,
                    state: true,
                    latitude: true,
                    longitude: true,
                  }
                }
              }
            }
          }
        })
        if (order?.vendor) {
          vendorInfo = {
            name: order.vendor.vendorProfile?.businessName || order.vendor.name,
            address: order.vendor.vendorProfile?.address,
            city: order.vendor.vendorProfile?.city,
            state: order.vendor.vendorProfile?.state,
            latitude: order.vendor.vendorProfile?.latitude,
            longitude: order.vendor.vendorProfile?.longitude,
          }
        }
      } catch (error) {
        console.error("Error fetching vendor info:", error)
      }
    }

    if (status === "IN_PROGRESS") {
      // Get order from metadata if exists
      const orderId = (metadata as any)?.orderId
      
      // Update order tracking if order exists
      if (orderId) {
        try {
          await prisma.orderTracking.create({
            data: {
              orderId: orderId,
              status: "OUT_FOR_DELIVERY",
              notes: `Mechanic started working on the service. ${notes ? `Notes: ${notes}` : ''}`,
              latitude: latitude || undefined,
              longitude: longitude || undefined,
              timestamp: new Date(),
            },
          })
          const linkedOrd = await prisma.order.findUnique({
            where: { id: orderId },
            select: { status: true, module: true },
          })
          if (linkedOrd?.module === "AUTO_PARTS") {
            await broadcastAutoPartsOrderEvent({
              orderId,
              status: linkedOrd.status,
              event: "order_updated",
            })
          }
        } catch (error) {
          console.error("Error creating order tracking:", error)
        }
      }

      // Notify customer that mechanic has started
      await NotificationBridge.sendNotification({
        userId: serviceRequest.customerId,
        title: 'Mechanic Started Work',
        message: `${mechanicName} has started working on your vehicle. You can track their location in real-time.`,
        type: 'MECHANIC_STATUS_UPDATE',
        module: 'AUTO_PARTS',
        actionUrl: `/auto-parts/service-requests/${requestId}`,
        data: {
          actionType: 'navigate',
          screen: 'CustomerServiceRequestDetails',
          params: [
            { name: 'requestId', value: requestId },
          ],
          status: 'IN_PROGRESS',
        }
      })
    } else if (status === "COMPLETED") {
      // Get order from metadata if exists
      const orderId = (metadata as any)?.orderId

      // AUTO_PARTS: order becomes DELIVERED only when the mechanic scans the customer's delivery QR — not here.
      if (orderId) {
        try {
          const linkedOrder = await prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true, module: true },
          })
          if (linkedOrder?.module !== "AUTO_PARTS") {
            await prisma.$transaction(async (tx) => {
              await tx.order.update({
                where: { id: orderId },
                data: {
                  status: "DELIVERED",
                },
              } as any)

              await tx.orderTracking.create({
                data: {
                  orderId: orderId,
                  status: "DELIVERED",
                  notes: `Service completed by mechanic. ${notes ? `Notes: ${notes}` : ""}`,
                  timestamp: new Date(),
                },
              })
            })
          }
        } catch (error) {
          console.error("Error updating order status:", error)
        }
      }

      // DO NOT update PartRequest status here - it should only be updated when customer approves
      // PartRequest will remain in ACCEPTED status until customer approves completion

      // Notify customer that job is completed and request approval
      // Navigate to service request details with showApproval flag to show approval button
      await NotificationBridge.sendNotification({
        userId: serviceRequest.customerId,
        title: 'Service Completed',
        message: `${mechanicName} has completed the service. Please approve to proceed.`,
        type: 'SERVICE_COMPLETED',
        module: 'AUTO_PARTS',
        actionUrl: `/auto-parts/service-requests/${requestId}`,
        data: {
          actionType: 'navigate',
          screen: 'CustomerServiceRequestDetails',
          params: [
            { name: 'requestId', value: requestId },
            { name: 'showApproval', value: true }, // Flag to show approval button
          ],
          mechanicId: serviceRequest.mechanicId,
          status: 'COMPLETED',
        }
      })
      
      socketServer?.sendNotificationToUser(serviceRequest.customerId, {
        type: 'service_completed',
        serviceRequestId: requestId,
        mechanicId: serviceRequest.mechanicId,
        mechanicName: mechanicName,
        showApproval: true,
      })
    } else if (status === "ACCEPTED" && metadata?.vendorId) {
      // When mechanic accepts and picks up, notify vendor
      const handoverCode = metadata?.handoverCode || "N/A"
      if (metadata.orderId) {
        // Update order tracking
        try {
          await prisma.orderTracking.create({
            data: {
              orderId: metadata.orderId,
              status: "CONFIRMED" as any, // Use CONFIRMED for OrderStatus enum
              notes: `Mechanic accepted service request and will pick up parts. Handover Code: ${handoverCode}`,
              latitude: latitude || undefined,
              longitude: longitude || undefined,
              timestamp: new Date(),
            },
          })
        } catch (error) {
          console.error("Error creating order tracking:", error)
        }

        await NotificationBridge.sendNotification({
          userId: metadata.vendorId,
          title: 'Parts Picked Up',
          message: `${mechanicName} has picked up the parts. Handover Code: ${handoverCode}`,
          type: 'VENDOR_HANDOVER_CODE',
          module: 'AUTO_PARTS',
          actionUrl: `/auto-parts/orders/${metadata.orderId}`,
          data: {
            actionType: 'navigate',
            screen: 'AutoPartsVendorOrderDetails',
            params: [
              { name: 'orderId', value: metadata.orderId },
            ],
            handoverCode: handoverCode,
          }
        })
      }
    }

    // Send real-time location update if mechanic is moving
    if (user.role === "MECHANIC" && latitude && longitude && status === "IN_PROGRESS") {
      socketServer?.sendNotificationToUser(serviceRequest.customerId, {
        type: 'mechanic_location_update',
        serviceRequestId: requestId,
        latitude: latitude,
        longitude: longitude,
        status: status,
      })
    }

    const metaFresh = (updatedRequest.metadata as Record<string, unknown>) || {}
    const partReqSocketId = metaFresh.requestId || metaFresh.partRequestId
    if (partReqSocketId) {
      socketServer?.emitAutoPartsRequestRoom(String(partReqSocketId), {
        type: "service_request_status_changed",
        serviceRequestId: requestId,
        status,
        orderId: metaFresh.orderId ?? null,
      })
    }
    await socketServer?.sendNotificationToUser(serviceRequest.customerId, {
      type: "auto_parts_service_request_refresh",
      serviceRequestId: requestId,
      event: "status_changed",
      status,
    })
    const mechanicUserId = (serviceRequest.mechanic as { user?: { id: string } } | null)?.user?.id
    if (mechanicUserId) {
      await socketServer?.sendNotificationToUser(mechanicUserId, {
        type: "auto_parts_service_request_refresh",
        serviceRequestId: requestId,
        event: "status_changed",
        status,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        serviceRequest: updatedRequest,
        vendorInfo: vendorInfo,
        handoverCode: metadata?.handoverCode,
        message: `Status updated to ${status}`
      }
    })

  } catch (error: any) {
    console.error("Update service request status error:", error)
    return NextResponse.json(
      { error: "Failed to update status", details: error.message },
      { status: 500 }
    )
  }
}

