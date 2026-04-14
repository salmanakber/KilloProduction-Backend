import { prisma } from "@/lib/prisma"
import { completeOrderWalletTransactions } from "@/lib/wallet-transaction-service"

/**
 * When the mechanic scans the customer delivery QR, treat the job as financially complete:
 * release PENDING vendor + mechanic wallet credits for the parent order and any child (multi-vendor) rows,
 * and mark linked mechanic service requests COMPLETED.
 */
export async function finalizeAutoPartsMechanicDelivery(orderIdFromScan: string): Promise<{
  rootParentId: string
  orderIdsSettled: string[]
  serviceRequestIds: string[]
  feedbackContext: {
    parentOrderId: string
    customerId: string | null
    mechanicUserId: string | null
    vendorUserIds: string[]
    serviceRequestIds: string[]
  }
}> {
  const row = await prisma.order.findUnique({
    where: { id: orderIdFromScan },
    select: { id: true, module: true, isChildOrder: true, childId: true },
  })
  if (!row || row.module !== "AUTO_PARTS") {
    return {
      rootParentId: orderIdFromScan,
      orderIdsSettled: [],
      serviceRequestIds: [],
      feedbackContext: {
        parentOrderId: orderIdFromScan,
        customerId: null,
        mechanicUserId: null,
        vendorUserIds: [],
        serviceRequestIds: [],
      },
    }
  }

  const rootParentId =
    row.isChildOrder && row.childId ? row.childId : row.id

  const children = await prisma.order.findMany({
    where: { childId: rootParentId, isChildOrder: true },
    select: { id: true, vendorId: true },
  })
  const orderIdsSettled = [rootParentId, ...children.map((c) => c.id)]

  const parentRow = await prisma.order.findUnique({
    where: { id: rootParentId },
    select: { customerId: true, vendorId: true, metadata: true },
  })
  const vendorUserIds = new Set<string>()
  if (parentRow?.vendorId) vendorUserIds.add(parentRow.vendorId)
  children.forEach((c) => {
    if (c.vendorId) vendorUserIds.add(c.vendorId)
  })
  const pmeta = (parentRow?.metadata as Record<string, unknown>) || {}
  const mechanicUserId = (pmeta.mechanicId as string) || null

  for (const oid of orderIdsSettled) {
    try {
      await completeOrderWalletTransactions(oid)
    } catch (e) {
      console.error("[finalizeAutoPartsMechanicDelivery] wallet settle failed for", oid, e)
    }
  }

  const srs = await prisma.mechanicServiceRequest.findMany({
    where: {
      OR: orderIdsSettled.map((id) => ({
        metadata: { path: ["orderId"], equals: id } as any,
      })),
    },
    select: { id: true, metadata: true },
  })

  const now = new Date().toISOString()
  for (const sr of srs) {
    const m = (sr.metadata as Record<string, unknown>) || {}
    try {
      await prisma.mechanicServiceRequest.update({
        where: { id: sr.id },
        data: {
          status: "COMPLETED",
          metadata: {
            ...m,
            completedViaDeliveryQr: true,
            completedAt: now,
            /** Customer delivery QR scan = work accepted; no separate in-app approval step */
            customerApproved: true,
            customerApprovedAt: now,
          } as any,
        },
      })
    } catch (e) {
      console.error("[finalizeAutoPartsMechanicDelivery] SR update failed", sr.id, e)
    }
  }

  const serviceRequestIds = srs.map((s) => s.id)

  return {
    rootParentId,
    orderIdsSettled,
    serviceRequestIds,
    feedbackContext: {
      parentOrderId: rootParentId,
      customerId: parentRow?.customerId ?? null,
      mechanicUserId,
      vendorUserIds: Array.from(vendorUserIds),
      serviceRequestIds,
    },
  }
}
