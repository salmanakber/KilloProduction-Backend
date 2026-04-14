import { prisma } from "@/lib/prisma"
import { getGlobalSocketServer } from "@/lib/socket-server"

/**
 * Push real-time order updates to customer, mechanic, vendors, and part-request subscribers.
 */
export async function broadcastAutoPartsOrderEvent(params: {
  orderId: string
  /** Parent order when notifying about a child row */
  parentOrderId?: string
  status?: string
  event: "pickup_verified" | "delivery_verified" | "handover_verified" | "order_updated"
}): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: params.orderId },
      select: {
        id: true,
        customerId: true,
        vendorId: true,
        childId: true,
        isChildOrder: true,
        partRequestId: true,
        metadata: true,
      },
    })
    if (!order) return

    const meta = (order.metadata as any) || {}
    const mechanicUserId: string | undefined = meta.mechanicId
    const partRequestId: string | null =
      order.partRequestId || meta.partRequestId || meta.requestId || null

    const parentId = order.isChildOrder ? order.childId : order.id
    const parent = parentId
      ? await prisma.order.findUnique({
          where: { id: parentId },
          select: { id: true, customerId: true, vendorId: true, metadata: true, partRequestId: true },
        })
      : null

    const parentMeta = (parent?.metadata as any) || {}
    const mechanicFromParent: string | undefined = parentMeta.mechanicId || mechanicUserId

    const vendorIds = new Set<string>()
    if (order.vendorId) vendorIds.add(order.vendorId)
    if (parent?.vendorId) vendorIds.add(parent.vendorId)

    const children = await prisma.order.findMany({
      where: { childId: parentId || order.id, isChildOrder: true },
      select: { vendorId: true },
    })
    children.forEach((c) => {
      if (c.vendorId) vendorIds.add(c.vendorId)
    })

    const prId = parent?.partRequestId || order.partRequestId || partRequestId || parentMeta.partRequestId || parentMeta.requestId

    const effectiveParentId = (parentId || params.orderId) as string

    let customerId = parent?.customerId ?? order.customerId ?? null
    if (!customerId) {
      const custRow = await prisma.order.findUnique({
        where: { id: effectiveParentId },
        select: { customerId: true },
      })
      customerId = custRow?.customerId ?? null
    }
    const childRowsForParent = await prisma.order.findMany({
      where: { childId: effectiveParentId, isChildOrder: true },
      select: { id: true },
    })
    const relatedOrderIds = new Set<string>([order.id, effectiveParentId])
    childRowsForParent.forEach((c) => relatedOrderIds.add(c.id))

    let serviceRequestIds: string[] = []
    const orderIdsForSr = [...new Set([params.orderId, parent?.id, order.id, effectiveParentId].filter(Boolean))] as string[]
    if (orderIdsForSr.length > 0) {
      const srs = await prisma.mechanicServiceRequest.findMany({
        where: {
          OR: orderIdsForSr.map((id) => ({
            metadata: { path: ["orderId"], equals: id } as any,
          })),
        },
        select: { id: true },
      })
      serviceRequestIds = [...new Set(srs.map((s) => s.id))]
    }

    const socketServer = getGlobalSocketServer()
    if (prId) {
      const roomPayload: Record<string, unknown> = {
        type: "order_status_update",
        orderId: params.orderId,
        parentOrderId: effectiveParentId,
        status: params.status,
        event: params.event,
        relatedOrderIds: Array.from(relatedOrderIds),
      }
      /** Part-request subscribers (e.g. customer on offers screen) may not get per-user socket events */
      if (params.event === "delivery_verified" && customerId) {
        roomPayload.promptFeedback = true
        roomPayload.feedbackContext = {
          parentOrderId: effectiveParentId,
          customerId,
          mechanicUserId: mechanicFromParent ?? null,
          vendorUserIds: Array.from(vendorIds),
          serviceRequestIds,
        }
      }
      socketServer.emitAutoPartsRequestRoom(String(prId), roomPayload)
    }

    const payload: Record<string, unknown> = {
      type: "auto_parts_order_update",
      orderId: effectiveParentId,
      parentOrderId: effectiveParentId,
      scannedOrderId: params.orderId,
      childOrderId: order.isChildOrder ? order.id : undefined,
      status: params.status,
      event: params.event,
      relatedOrderIds: Array.from(relatedOrderIds),
    }

    if (params.event === "delivery_verified" && customerId) {
      payload.promptFeedback = true
      payload.feedbackContext = {
        parentOrderId: effectiveParentId,
        customerId,
        mechanicUserId: mechanicFromParent ?? null,
        vendorUserIds: Array.from(vendorIds),
        serviceRequestIds,
      }
    }

    const notifyIds = new Set<string>()
    if (customerId) notifyIds.add(customerId)
    if (mechanicFromParent) notifyIds.add(mechanicFromParent)
    vendorIds.forEach((v) => notifyIds.add(v))

    for (const uid of notifyIds) {
      await socketServer.sendNotificationToUser(uid, payload)
    }

    if (params.event === "delivery_verified" && customerId) {
      const feedbackPayload = {
        type: "auto_parts_feedback_prompt",
        parentOrderId: effectiveParentId,
        customerId,
        mechanicUserId: mechanicFromParent ?? null,
        vendorUserIds: Array.from(vendorIds),
        serviceRequestIds,
        relatedOrderIds: Array.from(relatedOrderIds),
      }
      for (const uid of notifyIds) {
        await socketServer.sendNotificationToUser(uid, feedbackPayload)
      }
    }

    // So mechanic job screens refetch (metadata.partsPickedUp, order status) even if orderId matching is ambiguous
    if (mechanicFromParent && serviceRequestIds.length > 0) {
      const seenSr = new Set<string>()
      for (const srId of serviceRequestIds) {
        if (seenSr.has(srId)) continue
        seenSr.add(srId)
        await socketServer.sendNotificationToUser(mechanicFromParent, {
          type: "auto_parts_service_request_refresh",
          serviceRequestId: srId,
        })
      }
    }
  } catch (e) {
    console.error("broadcastAutoPartsOrderEvent:", e)
  }
}
