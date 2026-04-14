import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { runCourierCompletionSideEffects } from "@/lib/courier-post-completion"
import { finalizeCourierDropoffDelivery } from "@/lib/finalize-courier-dropoff-delivery"
import { processMechanicAutoPartsOrderQr } from "@/lib/mechanic-auto-parts-qr-verify"
import crypto from "crypto"

/**
 * POST /api/orders/verify-qr-code
 * Verify QR code scan for order pickup
 * Body: { qrCode: string, courierBookingId?: string, multiplePickupId?: string, phase?: 'PICKUP' | 'DELIVERY' }
 * Mechanics (AUTO_PARTS): scan vendor child ORDER QR at pickup, parent ORDER QR at delivery — no courierBookingId.
 */
function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, message, ...extra }, { status })
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return jsonError("Unauthorized", 401)
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return jsonError("Invalid JSON body", 400)
    }
    const { qrCode, courierBookingId, multiplePickupId, phase } = body as {
      qrCode?: string
      courierBookingId?: string
      multiplePickupId?: string
      phase?: string
    }
    const isDeliveryPhase = String(phase || "").toUpperCase() === "DELIVERY"

    if (!qrCode || typeof qrCode !== "string") {
      return jsonError("QR code is required", 400)
    }

    const qrNormalized = String(qrCode).trim()
    // Parse QR code: ORDER:{orderId}:{hash} or SUPPLIER_ORDER:{supplierOrderId}:{hash}
    const parts = qrNormalized.split(":")
    if (parts.length !== 3 || (parts[0] !== "ORDER" && parts[0] !== "SUPPLIER_ORDER")) {
      return jsonError(
        "Invalid QR code format. Expected ORDER:orderId:hash (copy from the app if needed).",
        400,
        { hint: "format" }
      )
    }

    const isSupplierOrder = parts[0] === 'SUPPLIER_ORDER'

    // --- Auto-parts mechanic as rider: vendor QR (pickup) + customer/parent QR (delivery) ---
    if (user.role === "MECHANIC") {
      if (isSupplierOrder) {
        return jsonError("Mechanics cannot scan supplier wholesaler QR codes here", 403)
      }
      const mechanicOrderId = parts[1]
      const providedHashMechanic = parts[2]
      const secretM = process.env.QR_CODE_SECRET || "default-secret-key-change-in-production"
      const orderForMechanic = await prisma.order.findUnique({
        where: { id: mechanicOrderId },
        select: {
          id: true,
          orderNumber: true,
          module: true,
        },
      })
      if (!orderForMechanic) {
        return jsonError("Order not found", 404)
      }
      if (orderForMechanic.module !== "AUTO_PARTS") {
        return jsonError("Mechanic QR verification is only for auto-parts orders", 403)
      }
      const expectedHashM = crypto
        .createHmac("sha256", secretM)
        .update(`${orderForMechanic.id}:${orderForMechanic.orderNumber}`)
        .digest("hex")
        .substring(0, 16)
      if (providedHashMechanic !== expectedHashM) {
        return jsonError(
          "Invalid QR code (hash mismatch). Regenerate the QR from the customer or vendor order screen.",
          400,
          { hint: "hash_mismatch" }
        )
      }
      const result = await processMechanicAutoPartsOrderQr({
        mechanicUserId: user.id,
        scannedOrderId: mechanicOrderId,
        isDeliveryPhase,
      })
      if (!result.ok) {
        console.warn("[verify-qr-code] mechanic auto-parts rejected", {
          phase: isDeliveryPhase ? "DELIVERY" : "PICKUP",
          orderId: mechanicOrderId,
          status: result.status,
          error: result.error,
        })
        return jsonError(result.error, result.status, { phase: isDeliveryPhase ? "DELIVERY" : "PICKUP" })
      }
      return NextResponse.json(result.body)
    }

    if (user.role !== "RIDER") {
      return NextResponse.json({ error: "Only riders can verify QR codes" }, { status: 403 })
    }
    const orderId = parts[1]
    const providedHash = parts[2]

    // Verify hash and get order/supplier order
    const secret = process.env.QR_CODE_SECRET || 'default-secret-key-change-in-production'
    let order: any = null
    let supplierOrder: any = null

    if (isSupplierOrder) {
      // Handle supplier order QR code
      supplierOrder = await prisma.supplierOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          pharmacyId: true,
          wholesalerId: true,
          pharmacy: {
            select: {
              userId: true,
            }
          },
          courierBookingId: true,
          status: true,
        },
      })

      if (!supplierOrder) {
        console.log( "supplierOrder not found", orderId)
        return NextResponse.json({ error: "Supplier order not found" }, { status: 404 })
      }

      const expectedHash = crypto
        .createHmac('sha256', secret)
        .update(`${supplierOrder.id}:${supplierOrder.orderNumber}`)
        .digest('hex')
        .substring(0, 16)

      if (providedHash !== expectedHash) {
        console.log( "providedHash", providedHash)
        console.log( "expectedHash", expectedHash)
        return NextResponse.json({ error: "Invalid QR code" }, { status: 400 })
      }

      // If courierBookingId provided, verify it matches
      if (courierBookingId) {
        const courierBooking = await prisma.courierBooking.findUnique({
          where: { id: courierBookingId },
          select: {
            id: true,
            riderId: true,
            supplierOrders: {
              select: {
                id: true,
              }
            }
          },
        })

        if (!courierBooking) {
          return NextResponse.json({ error: "Courier booking not found" }, { status: 404 })
        }

        // Verify rider is assigned to this booking
        if (courierBooking.riderId !== user.id) {
          return NextResponse.json({ error: "You are not assigned to this booking" }, { status: 403 })
        }

        // Verify supplier order matches booking
        const supplierOrderIds = courierBooking.supplierOrders.map(so => so.id)
        if (!supplierOrderIds.includes(supplierOrder.id)) {
          console.log( "supplierOrderIds", supplierOrderIds)
          console.log( "supplierOrder.id", supplierOrder.id)
          return NextResponse.json({ error: "Supplier order does not match this booking" }, { status: 400 })
        }
      }

      if (isDeliveryPhase) {
        if (!courierBookingId) {
          console.log( "courierBookingId is required for delivery confirmation", courierBookingId)
          return NextResponse.json(
            
            { error: "courierBookingId is required for delivery confirmation" },
            { status: 400 }
          )
        }
        const cb = await prisma.courierBooking.findUnique({
          where: { id: courierBookingId },
          select: { id: true, riderId: true, status: true },
        })
        if (!cb || cb.riderId !== user.id) {
          return NextResponse.json({ error: "You are not assigned to this booking" }, { status: 403 })
        }
        const linkCheck = await prisma.courierBooking.findUnique({
          where: { id: courierBookingId },
          select: { supplierOrders: { select: { id: true } } },
        })
        const ids = linkCheck?.supplierOrders.map((s) => s.id) || []
        if (!ids.includes(supplierOrder.id)) {
          console.log( "ids", ids)
          console.log( "supplierOrder.id", supplierOrder.id)
          return NextResponse.json({ error: "Supplier order does not match this booking" }, { status: 400 })
        }
        if (cb.status === "COMPLETED") {
          return NextResponse.json({
            success: true,
            verified: true,
            deliveryCompleted: true,
            alreadyCompleted: true,
            supplierOrderId: supplierOrder.id,
          })
        }
        if (cb.status !== "ARRIVED_AT_DROPOFF") {
          console.log( "cb.status", cb.status)
          console.log( "cb.status is not ARRIVED_AT_DROPOFF", cb.status)
          return NextResponse.json(
            { error: "Arrive at dropoff before confirming delivery" },
            { status: 400 }
          )
        }
        await prisma.courierBooking.update({
          where: { id: courierBookingId },
          data: { status: "COMPLETED", deliveredAt: new Date() },
        })
        await runCourierCompletionSideEffects(courierBookingId)
        return NextResponse.json({
          success: true,
          verified: true,
          deliveryCompleted: true,
          supplierOrderId: supplierOrder.id,
          orderNumber: supplierOrder.orderNumber,
          module: "WHOLESALER",
          message: "Delivery confirmed",
        })
      }

      return NextResponse.json({
        success: true,
        verified: true,
        supplierOrderId: supplierOrder.id,
        orderNumber: supplierOrder.orderNumber,
        module: "WHOLESALER",
        message: "QR code verified successfully",
      })
    } else {
      // Handle regular order QR code (existing logic)
      order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          vendorId: true,
          customerId: true,
          module: true,
          isChildOrder: true,
          childId: true,
        },
      })

      if (!order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 })
      }

      const expectedHash = crypto
        .createHmac('sha256', secret)
        .update(`${order.id}:${order.orderNumber}`)
        .digest('hex')
        .substring(0, 16)

      if (providedHash !== expectedHash) {
        console.log( "providedHash", providedHash)
        return NextResponse.json({ error: "Invalid QR code" }, { status: 400 })
      }

      // If courierBookingId provided, verify it matches
      if (courierBookingId) {
        const courierBooking = await prisma.courierBooking.findUnique({
          where: { id: courierBookingId },
          select: {
            id: true,
            orderId: true,
            riderId: true,
          },
        })

        if (!courierBooking) {
          return NextResponse.json({ error: "Courier booking not found" }, { status: 404 })
        }

        // Verify rider is assigned to this booking
        if (courierBooking.riderId !== user.id) {
          return NextResponse.json({ error: "You are not assigned to this booking" }, { status: 403 })
        }

        // Verify order matches booking (parent order or child order)
        const parentOrderId = order.isChildOrder ? order.childId : order.id
        if (courierBooking.orderId !== parentOrderId) {
          console.log( "courierBooking.orderId", courierBooking.orderId)
          console.log( "parentOrderId", parentOrderId)
          return NextResponse.json({ error: "Order does not match this booking" }, { status: 400 })
        }

        // Delivery completion: customer QR at dropoff — completes booking and releases pending wallets
        if (isDeliveryPhase && !multiplePickupId) {
          const fullBooking = await prisma.courierBooking.findUnique({
            where: { id: courierBookingId },
            select: { id: true, orderId: true },
          })
          if (!fullBooking?.orderId || fullBooking.orderId !== parentOrderId) {
            console.log( "fullBooking.orderId", fullBooking.orderId)
            console.log( "parentOrderId", parentOrderId)
            return NextResponse.json({ error: "Order does not match this booking" }, { status: 400 })
          }

          const result = await finalizeCourierDropoffDelivery(courierBookingId)

          if (!result.success) {
            console.log( "result.success", result.success)
            return NextResponse.json({ error: result.error || "Failed to complete delivery" }, { status: 400 })
          }

          return NextResponse.json({
            success: true,
            verified: true,
            deliveryCompleted: true,
            alreadyCompleted: result.alreadyCompleted,
            orderId: order.id,
            orderNumber: order.orderNumber,
            module: order.module,
            message: "Delivery confirmed",
          })
        }

        // If multiplePickupId provided, verify order matches pickup and mark as picked up
        if (multiplePickupId) {
        const multiplePickup = await prisma.multiplePickup.findUnique({
          where: { id: multiplePickupId },
          select: {
            id: true,
            courierBookingId: true,
            groceryStoreId: true,
            restaurantId: true,
            pharmacyId: true,
            module: true,
            orderId: true,
            status: true,
          },
        })

        if (!multiplePickup) {
          return NextResponse.json({ error: "Pickup point not found" }, { status: 404 })
        }

        // Verify this pickup belongs to the courier booking
        if (multiplePickup.courierBookingId !== courierBookingId) {
          console.log( "multiplePickup.courierBookingId", multiplePickup.courierBookingId)
          console.log( "courierBookingId", courierBookingId)
          return NextResponse.json({ error: "Pickup point does not match booking" }, { status: 400 })
        }

        // Verify order is a child order (QR codes are only for child orders)
        if (!order.isChildOrder) {
          console.log( "order.isChildOrder", order.isChildOrder)
          return NextResponse.json({ 
            error: "QR code must be from a child order (vendor order)" 
          }, { status: 400 })
        }

        // Verify order's module matches pickup's module
        if (order.module !== multiplePickup.module) {
          console.log( "order.module", order.module)
          console.log( "multiplePickup.module", multiplePickup.module)
          return NextResponse.json({ 
            error: `Order module (${order.module}) does not match pickup module (${multiplePickup.module})` 
          }, { status: 400 })
        }

        // Verify order's vendorId matches the pickup's store ID based on module
        let storeId: string | null = null
        switch (order.module) {
          case 'GROCERY':
            storeId = multiplePickup.groceryStoreId
            break
          case 'FOOD':
            storeId = multiplePickup.restaurantId
            break
          case 'PHARMACY':
            storeId = multiplePickup.pharmacyId
            break
          default:
            console.log( "order.module is not supported", order.module)
            return NextResponse.json({ 
              error: `Unsupported module: ${order.module}` 
            }, { status: 400 })
        }

        if (!storeId) {
          console.log( "storeId is null", storeId)
          return NextResponse.json({ 
            error: `Pickup point does not have a ${order.module} store ID` 
          }, { status: 400 })
        }

        // Get the store's userId to match with order's vendorId
        let storeUserId: string | null = null
        if (order.module === 'GROCERY') {
          const groceryStore = await prisma.groceryStore.findUnique({
            where: { id: storeId },
            select: { userId: true },
          })
          storeUserId = groceryStore?.userId || null
        } else if (order.module === 'FOOD') {
          const restaurant = await prisma.restaurant.findUnique({
            where: { id: storeId },
            select: { userId: true },
          })
          storeUserId = restaurant?.userId || null
        } else if (order.module === 'PHARMACY') {
          const pharmacy = await prisma.pharmacy.findUnique({
            where: { id: storeId },
            select: { userId: true },
          })
          storeUserId = pharmacy?.userId || null
        }

        if (!storeUserId) {
          console.log( "storeUserId is null", storeUserId)
          return NextResponse.json({ 
            error: `Store not found for pickup point` 
          }, { status: 404 })
        }

        // Verify order's vendorId matches the store's userId
        if (order.vendorId !== storeUserId) {
          console.log( "order.vendorId", order.vendorId)
          console.log( "storeUserId", storeUserId)
          return NextResponse.json({ 
            error: `QR code order does not belong to this pickup point. This QR code is for a different store.` 
          }, { status: 400 })
        }

        // Verify order's parent order matches the pickup's orderId (if set)
        if (multiplePickup.orderId) {
          const parentOrderId = order.childId
          if (parentOrderId !== multiplePickup.orderId) {
            console.log( "parentOrderId", parentOrderId)
            console.log( "multiplePickup.orderId", multiplePickup.orderId)
            return NextResponse.json({ 
              error: `Order does not match the pickup point's parent order` 
            }, { status: 400 })
          }
        }

        // Update pickup status
        await prisma.multiplePickup.update({
          where: { id: multiplePickupId },
          data: {
            status: 'PICKED_UP',
            pickedUpAt: new Date(),
          },
        })
        }
      }

      return NextResponse.json({
        success: true,
        verified: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        module: order.module,
        message: "QR code verified successfully",
      })
    }
  } catch (error) {
    console.error("Error verifying QR code:", error)
    const msg = error instanceof Error ? error.message : "Failed to verify QR code"
    return jsonError(msg, 500, { code: "verify_qr_internal" })
  }
}
