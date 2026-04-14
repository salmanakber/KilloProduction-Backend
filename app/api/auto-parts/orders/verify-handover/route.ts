import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"
import { broadcastAutoPartsOrderEvent } from "@/lib/auto-parts-order-socket-broadcast"
import crypto from "crypto"

const PICKUP_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "AWAITING_MECHANIC_OFFER",
] as const

function resolveHandoverCode(order: {
  metadata: unknown
  isChildOrder?: boolean | null
  childId?: string | null
}, parentMeta: Record<string, unknown> | null): string | undefined {
  const m = (order.metadata as Record<string, unknown>) || {}
  if (typeof m.handoverCode === "string" && m.handoverCode) return m.handoverCode
  if (order.isChildOrder && parentMeta && typeof parentMeta.handoverCode === "string") {
    return parentMeta.handoverCode
  }
  return undefined
}

/**
 * POST /api/auto-parts/orders/verify-handover
 * Body: { handoverCode?: string, qrCode?: string }
 * - Plain handover code: matches metadata on vendor child/parent or linked service request.
 * - Store QR string (ORDER:orderId:hash): same as GET /orders/:id/qr-code; vendor must own the order
 *   (child row for multi-vendor, or the single combined order when isChildOrder is false).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const raw = String(body.handoverCode ?? body.qrCode ?? "").trim()

    if (!raw) {
      return NextResponse.json({ error: "Handover code or QR text is required" }, { status: 400 })
    }

    const includeOrder = {
      customer: { select: { id: true, name: true } },
      partRequest: {
        include: {
          user: { select: { id: true, name: true } },
        },
      },
    } as const

    let matchedOrder: any = null
    let verificationLabel = raw

    // --- A) Pasted store QR (ORDER:uuid:hash) ---
    if (raw.startsWith("ORDER:")) {
      const parts = raw.split(":")
      if (parts.length !== 3 || parts[0] !== "ORDER") {
        return NextResponse.json({ error: "Invalid QR code format" }, { status: 400 })
      }
      const orderId = parts[1]
      const providedHash = parts[2]
      const secret = process.env.QR_CODE_SECRET || "default-secret-key-change-in-production"

      const row = await prisma.order.findUnique({
        where: { id: orderId },
        include: includeOrder as any,
      })

      if (!row || row.module !== "AUTO_PARTS") {
        return NextResponse.json({ error: "Order not found" }, { status: 404 })
      }
      if (row.vendorId !== user.id) {
        return NextResponse.json({ error: "This QR is not for your store" }, { status: 403 })
      }
      const expectedHash = crypto
        .createHmac("sha256", secret)
        .update(`${row.id}:${row.orderNumber}`)
        .digest("hex")
        .substring(0, 16)
      if (providedHash !== expectedHash) {
        return NextResponse.json({ error: "Invalid QR code" }, { status: 400 })
      }
      if (!PICKUP_STATUSES.includes(row.status as any)) {
        return NextResponse.json(
          { error: "Order is not in a valid state for pickup verification" },
          { status: 400 }
        )
      }
      matchedOrder = row
      verificationLabel = "store_qr_verified"
    }

    // --- B) Plain handover code ---
    if (!matchedOrder) {
      const orders = await prisma.order.findMany({
        where: {
          vendorId: user.id,
          module: "AUTO_PARTS",
          status: { in: [...PICKUP_STATUSES] },
        },
        include: includeOrder as any,
      })

      const parentIds = orders.filter((o) => o.isChildOrder && o.childId).map((o) => o.childId as string)
      const parents =
        parentIds.length > 0
          ? await prisma.order.findMany({
              where: { id: { in: parentIds } },
              select: { id: true, metadata: true },
            })
          : []
      const parentMetaById = new Map(parents.map((p) => [p.id, (p.metadata as Record<string, unknown>) || {}]))

      for (const order of orders) {
        const parentMeta = order.isChildOrder && order.childId ? parentMetaById.get(order.childId) || null : null
        const code = resolveHandoverCode(order, parentMeta)
        if (code && code === raw) {
          matchedOrder = order
          break
        }
      }
    }

    // --- C) Service request metadata (handover on SR + order link) ---
    if (!matchedOrder) {
      const serviceRequests = await prisma.mechanicServiceRequest.findMany({
        where: {
          status: { in: ["ACCEPTED", "IN_PROGRESS"] },
        },
        include: {
          mechanic: {
            include: {
              user: { select: { id: true, name: true } },
            },
          },
        },
      })

      for (const sr of serviceRequests) {
        const srMetadata = (sr.metadata as Record<string, unknown>) || {}
        if (srMetadata.handoverCode !== raw || !srMetadata.orderId) continue

        const foundOrder = await prisma.order.findUnique({
          where: { id: String(srMetadata.orderId) },
          include: includeOrder as any,
        })
        if (foundOrder && foundOrder.vendorId === user.id) {
          matchedOrder = foundOrder
          break
        }
      }
    }

    if (!matchedOrder) {
      return NextResponse.json(
        {
          error:
            "No matching handover code or store QR. Paste the mechanic code, or your store pickup QR text from Copy QR.",
        },
        { status: 404 }
      )
    }

    const parentIdForSr =
      matchedOrder.isChildOrder && matchedOrder.childId ? matchedOrder.childId : matchedOrder.id
    const candidateOrderIds = [matchedOrder.id, parentIdForSr].filter((id, i, a) => a.indexOf(id) === i)

    const transactionResult = await prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: matchedOrder!.id },
        data: { status: "OUT_FOR_DELIVERY", pickedUpAt: new Date() },
      })

      await tx.orderTracking.create({
        data: {
          orderId: order.id,
          status: "OUT_FOR_DELIVERY",
          notes: `Parts picked up by mechanic. Verified: ${verificationLabel}`,
        },
      } as any)

      /** Multi-vendor: child row was updated — keep parent in sync so customer sees IN TRANSIT, not CONFIRMED */
      if (matchedOrder.isChildOrder && matchedOrder.childId) {
        await tx.order.update({
          where: { id: matchedOrder.childId },
          data: { status: "OUT_FOR_DELIVERY", pickedUpAt: new Date() },
        })
        await tx.orderTracking.create({
          data: {
            orderId: matchedOrder.childId,
            status: "OUT_FOR_DELIVERY",
            notes: `Pickup verified (store order ${matchedOrder.orderNumber}). Parent synced to out for delivery.`,
          },
        } as any)
      }

      const serviceRequests = await tx.mechanicServiceRequest.findMany({
        where: { status: { in: ["ACCEPTED", "IN_PROGRESS"] } },
        include: {
          mechanic: {
            include: {
              user: { select: { id: true, name: true } },
            },
          },
        },
      })

      const parentMeta =
        matchedOrder.isChildOrder && matchedOrder.childId
          ? await tx.order.findUnique({
              where: { id: matchedOrder.childId },
              select: { metadata: true },
            })
          : null
      const pHandover =
        (parentMeta?.metadata as Record<string, unknown> | undefined)?.handoverCode ?? undefined

      let updatedServiceRequest: any = null
      for (const sr of serviceRequests) {
        const srMetadata = (sr.metadata as Record<string, unknown>) || {}
        const oid = srMetadata.orderId
        if (!oid || !candidateOrderIds.includes(String(oid))) continue

        const srCode = srMetadata.handoverCode
        const matchesHandover =
          srCode === raw ||
          (typeof srCode === "string" && typeof pHandover === "string" && srCode === pHandover) ||
          verificationLabel === "store_qr_verified"

        if (!matchesHandover) continue

        updatedServiceRequest = await tx.mechanicServiceRequest.update({
          where: { id: sr.id },
          data: {
            metadata: {
              ...srMetadata,
              partsPickedUp: true,
              pickedUpAt: new Date().toISOString(),
            },
          } as any,
        })
        updatedServiceRequest.mechanic = sr.mechanic
        break
      }

      return { order, updatedServiceRequest }
    })

    const updatedOrder = transactionResult.order
    const updatedServiceRequest = transactionResult.updatedServiceRequest

    const customerNavOrderId =
      matchedOrder.isChildOrder && matchedOrder.childId ? matchedOrder.childId : updatedOrder.id

    await broadcastAutoPartsOrderEvent({
      orderId: updatedOrder.id,
      parentOrderId: matchedOrder.isChildOrder ? matchedOrder.childId : undefined,
      status: "OUT_FOR_DELIVERY",
      event: "handover_verified",
    })
    if (matchedOrder.isChildOrder && matchedOrder.childId) {
      await broadcastAutoPartsOrderEvent({
        orderId: matchedOrder.childId,
        status: "OUT_FOR_DELIVERY",
        event: "handover_verified",
      })
    }

    const socketServer = getGlobalSocketServer()
    const mechanicUserId = updatedServiceRequest?.mechanic?.userId

    if (mechanicUserId && socketServer) {
      await socketServer.sendNotificationToUser(mechanicUserId, {
        type: "handover_code_verified",
        serviceRequestId: updatedServiceRequest?.id,
        orderId: updatedOrder.id,
        handoverCode: raw,
      })
    }

    if (matchedOrder.customerId) {
      await NotificationBridge.sendNotification({
        userId: matchedOrder.customerId,
        title: "Parts picked up",
        message: `Your parts have been picked up by the mechanic and are on the way.`,
        type: "ORDER_STATUS_UPDATE",
        module: "AUTO_PARTS",
        data: {
          actionType: "navigate",
          screen: "AutoPartsCustomerOrderDetails",
          params: [{ name: "orderId", value: customerNavOrderId }],
          orderId: customerNavOrderId,
          orderNumber: matchedOrder.orderNumber,
          status: "OUT_FOR_DELIVERY",
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        order: updatedOrder,
        message: "Verification successful. Order status updated.",
      },
    })
  } catch (error: any) {
    console.error("Verify handover code error:", error)
    return NextResponse.json(
      { error: "Failed to verify handover code", details: error.message },
      { status: 500 }
    )
  }
}
