import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"
import { broadcastAutoPartsOrderEvent } from "@/lib/auto-parts-order-socket-broadcast"
import { finalizeAutoPartsMechanicDelivery } from "@/lib/auto-parts-mechanic-delivery-finalize"

/** Allow pickup QR while order is still being prepared or ready at vendor — not only CONFIRMED */
const PICKUP_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "AWAITING_MECHANIC_OFFER",
] as const

function navPayload(orderId: string) {
  return {
    actionType: "navigate" as const,
    screen: "AutoPartsCustomerOrderDetails",
    params: [{ name: "orderId", value: orderId }],
  }
}

export async function processMechanicAutoPartsOrderQr(params: {
  mechanicUserId: string
  scannedOrderId: string
  isDeliveryPhase: boolean
}): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const { mechanicUserId, scannedOrderId, isDeliveryPhase } = params

  const scanned = await prisma.order.findUnique({
    where: { id: scannedOrderId },
    select: {
      id: true,
      orderNumber: true,
      module: true,
      status: true,
      isChildOrder: true,
      childId: true,
      vendorId: true,
      customerId: true,
      metadata: true,
    },
  })

  if (!scanned || scanned.module !== "AUTO_PARTS") {
    return { ok: false, status: 400, error: "Invalid order for mechanic pickup or delivery" }
  }

  if (isDeliveryPhase) {
    if (scanned.isChildOrder) {
      return { ok: false, status: 400, error: "Scan the customer's order QR (not the store pickup code)" }
    }

    const meta = (scanned.metadata as any) || {}
    if (meta.mechanicId !== mechanicUserId) {
      return { ok: false, status: 403, error: "You are not assigned to this order" }
    }

    // Already delivered (e.g. duplicate scan, or legacy flow) — idempotent success for assigned mechanic
    if (scanned.status === "DELIVERED") {
      const fin = await finalizeAutoPartsMechanicDelivery(scanned.id)
      await broadcastAutoPartsOrderEvent({
        orderId: scanned.id,
        status: "DELIVERED",
        event: "delivery_verified",
      })
      return {
        ok: true,
        body: {
          success: true,
          verified: true,
          deliveryCompleted: true,
          alreadyCompleted: true,
          orderId: scanned.id,
          orderNumber: scanned.orderNumber,
          module: scanned.module,
          message: "Delivery was already confirmed for this order",
          feedbackContext: fin.feedbackContext,
          walletsSettledOrderIds: fin.orderIdsSettled,
        },
      }
    }

    const allowed = ["OUT_FOR_DELIVERY", "IN_TRANSIT", "PICKED_UP", "EN_ROUTE_TO_DROPOFF"]
    if (!allowed.includes(scanned.status)) {
      return {
        ok: false,
        status: 400,
        error: `Order is not ready for customer delivery confirmation (current status: ${scanned.status}). Use the customer's delivery QR only after pickup is done and the order is out for delivery.`,
      }
    }

    const now = new Date()
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: scanned.id },
        data: { status: "DELIVERED", deliveredAt: now },
      })

      await tx.order.updateMany({
        where: { childId: scanned.id, isChildOrder: true },
        data: { status: "DELIVERED", deliveredAt: now },
      })

      await tx.orderTracking.create({
        data: {
          orderId: scanned.id,
          status: "DELIVERED",
          notes: "Mechanic scanned customer delivery QR — parts delivered",
          timestamp: now,
        },
      } as any)
    })

    const fin = await finalizeAutoPartsMechanicDelivery(scanned.id)

    await broadcastAutoPartsOrderEvent({
      orderId: scanned.id,
      status: "DELIVERED",
      event: "delivery_verified",
    })

    const fc = fin.feedbackContext
    const vendorIds = Array.from(new Set(fc.vendorUserIds.filter(Boolean)))
    const mechanicUid = fc.mechanicUserId || meta.mechanicId

    await NotificationBridge.sendNotification({
      userId: scanned.customerId,
      title: "Delivery confirmed — rate your experience",
      message: `Order #${scanned.orderNumber} is delivered. Rate your mechanic and parts seller(s).`,
      type: "REVIEW_REQUEST",
      module: "AUTO_PARTS",
      data: {
        ...navPayload(scanned.id),
        orderId: scanned.id,
        orderNumber: scanned.orderNumber,
        feedbackPrompt: true,
        rateTargets: ["MECHANIC", "VENDOR"],
      },
    })

    if (mechanicUid) {
      await NotificationBridge.sendNotification({
        userId: mechanicUid,
        title: "Rate this customer",
        message: `Delivery confirmed for order #${scanned.orderNumber}. Leave quick feedback on the buyer.`,
        type: "REVIEW_REQUEST",
        module: "AUTO_PARTS",
        data: {
          orderId: scanned.id,
          orderNumber: scanned.orderNumber,
          feedbackPrompt: true,
          rateTargets: ["CUSTOMER"],
        },
      })
    }

    for (const vid of vendorIds) {
      await NotificationBridge.sendNotification({
        userId: vid,
        title: "Rate this customer",
        message: `Order #${scanned.orderNumber} was delivered. Share feedback on your buyer.`,
        type: "REVIEW_REQUEST",
        module: "AUTO_PARTS",
        data: {
          actionType: "navigate",
          screen: "AutoPartsVendorOrderDetails",
          params: [{ name: "orderId", value: scanned.id }],
          orderId: scanned.id,
          orderNumber: scanned.orderNumber,
          feedbackPrompt: true,
          rateTargets: ["CUSTOMER"],
        },
      })
    }

    return {
      ok: true,
      body: {
        success: true,
        verified: true,
        deliveryCompleted: true,
        orderId: scanned.id,
        orderNumber: scanned.orderNumber,
        module: scanned.module,
        message: "Delivery confirmed",
        feedbackContext: fin.feedbackContext,
        walletsSettledOrderIds: fin.orderIdsSettled,
      },
    }
  }

  // PICKUP — single-vendor: one Order row (isChildOrder false) with vendorId; mechanic scans that store QR
  if (!scanned.isChildOrder) {
    if (!scanned.vendorId) {
      return {
        ok: false,
        status: 400,
        error: "Scan the store pickup QR from the vendor order screen (not the customer delivery QR)",
      }
    }
    const sMeta = (scanned.metadata as any) || {}
    if (sMeta.mechanicId !== mechanicUserId) {
      return { ok: false, status: 403, error: "You are not assigned to this job" }
    }
    if (!PICKUP_STATUSES.includes(scanned.status as any)) {
      return { ok: false, status: 400, error: "This pickup QR is no longer valid for this order status" }
    }
    const handoverSingle = sMeta.handoverCode as string | undefined

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: scanned.id },
        data: { status: "OUT_FOR_DELIVERY", pickedUpAt: new Date() },
      })
      await tx.orderTracking.create({
        data: {
          orderId: scanned.id,
          status: "OUT_FOR_DELIVERY",
          notes: `Mechanic scanned vendor pickup QR (single-vendor order ${scanned.orderNumber})`,
        },
      } as any)

      const srs = await tx.mechanicServiceRequest.findMany({
        where: {
          metadata: { path: ["orderId"], equals: scanned.id } as any,
        },
      })
      for (const sr of srs) {
        const srMeta = (sr.metadata as any) || {}
        if (!handoverSingle || srMeta.handoverCode === handoverSingle) {
          await tx.mechanicServiceRequest.update({
            where: { id: sr.id },
            data: {
              metadata: {
                ...srMeta,
                partsPickedUp: true,
                pickedUpAt: new Date().toISOString(),
                pickupVerifiedBy: "MECHANIC_QR",
              },
            } as any,
          })
          break
        }
      }
    })

    await broadcastAutoPartsOrderEvent({
      orderId: scanned.id,
      status: "OUT_FOR_DELIVERY",
      event: "pickup_verified",
    })

    if (scanned.customerId) {
      await NotificationBridge.sendNotification({
        userId: scanned.customerId,
        title: "Parts picked up",
        message: `Your mechanic picked up parts from the vendor for order #${scanned.orderNumber}.`,
        type: "ORDER_STATUS_UPDATE",
        module: "AUTO_PARTS",
        data: {
          ...navPayload(scanned.id),
          orderId: scanned.id,
          orderNumber: scanned.orderNumber,
        },
      })
    }

    if (scanned.vendorId) {
      await NotificationBridge.sendNotification({
        userId: scanned.vendorId,
        title: "Pickup confirmed",
        message: `Mechanic verified pickup for order #${scanned.orderNumber}.`,
        type: "ORDER_STATUS_UPDATE",
        module: "AUTO_PARTS",
        data: {
          actionType: "navigate",
          screen: "AutoPartsVendorOrderDetails",
          params: [{ name: "orderId", value: scanned.id }],
          orderId: scanned.id,
        },
      })
    }

    return {
      ok: true,
      body: {
        success: true,
        verified: true,
        pickupCompleted: true,
        orderId: scanned.id,
        orderNumber: scanned.orderNumber,
        module: "AUTO_PARTS",
        message: "Vendor pickup verified",
      },
    }
  }

  const parentId = scanned.childId
  if (!parentId) {
    return { ok: false, status: 400, error: "Invalid store order" }
  }

  const parent = await prisma.order.findUnique({
    where: { id: parentId },
    select: { id: true, orderNumber: true, metadata: true, customerId: true, vendorId: true, status: true },
  })

  if (!parent) {
    return { ok: false, status: 404, error: "Parent order not found" }
  }

  const pmeta = (parent.metadata as any) || {}
  if (pmeta.mechanicId !== mechanicUserId) {
    return { ok: false, status: 403, error: "You are not assigned to this job" }
  }

  if (!PICKUP_STATUSES.includes(scanned.status as any)) {
    return { ok: false, status: 400, error: "This pickup QR is no longer valid for this order status" }
  }

  const handoverCode = pmeta.handoverCode as string | undefined

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: parent.id },
      data: { status: "OUT_FOR_DELIVERY", pickedUpAt: new Date() },
    })

    await tx.order.update({
      where: { id: scanned.id },
      data: { status: "OUT_FOR_DELIVERY", pickedUpAt: new Date() },
    })

    await tx.orderTracking.create({
      data: {
        orderId: parent.id,
        status: "OUT_FOR_DELIVERY",
        notes: `Mechanic scanned vendor pickup QR (store order ${scanned.orderNumber})`,
      },
    } as any)

    const serviceRequests = await tx.mechanicServiceRequest.findMany({
      where: {
        metadata: {
          path: ["orderId"],
          equals: parent.id,
        } as any,
      },
    })

    for (const sr of serviceRequests) {
      const srMeta = (sr.metadata as any) || {}
      if (!handoverCode || srMeta.handoverCode === handoverCode) {
        await tx.mechanicServiceRequest.update({
          where: { id: sr.id },
          data: {
            metadata: {
              ...srMeta,
              partsPickedUp: true,
              pickedUpAt: new Date().toISOString(),
              pickupVerifiedBy: "MECHANIC_QR",
            },
          } as any,
        })
        break
      }
    }
  })

  await broadcastAutoPartsOrderEvent({
    orderId: scanned.id,
    parentOrderId: parent.id,
    status: "OUT_FOR_DELIVERY",
    event: "pickup_verified",
  })

  if (parent.customerId) {
    await NotificationBridge.sendNotification({
      userId: parent.customerId,
      title: "Parts picked up",
      message: `Your mechanic picked up parts from the vendor for order #${parent.orderNumber}.`,
      type: "ORDER_STATUS_UPDATE",
      module: "AUTO_PARTS",
      data: {
        ...navPayload(parent.id),
        orderId: parent.id,
        orderNumber: parent.orderNumber,
      },
    })
  }

  if (scanned.vendorId) {
    await NotificationBridge.sendNotification({
      userId: scanned.vendorId,
      title: "Pickup confirmed",
      message: `Mechanic verified pickup for order #${scanned.orderNumber}.`,
      type: "ORDER_STATUS_UPDATE",
      module: "AUTO_PARTS",
      data: {
        actionType: "navigate",
        screen: "AutoPartsVendorOrderDetails",
        params: [{ name: "orderId", value: scanned.id }],
        orderId: scanned.id,
      },
    })
  }

  return {
    ok: true,
    body: {
      success: true,
      verified: true,
      pickupCompleted: true,
      orderId: parent.id,
      childOrderId: scanned.id,
      orderNumber: parent.orderNumber,
      module: "AUTO_PARTS",
      message: "Vendor pickup verified",
    },
  }
}
