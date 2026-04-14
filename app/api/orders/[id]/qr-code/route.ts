import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import crypto from "crypto"

/**
 * GET /api/orders/[id]/qr-code
 * Generate QR code data for an order
 * QR code contains: orderId + secret hash for verification
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orderId = params.id

    // Get the order
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        vendorId: true,
        customerId: true,
        module: true,
        isChildOrder: true,
        childId: true,
        pharmacyId: true,
      },
    })

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const isCustomer = order.customerId === user.id
    const isVendor = order.vendorId === user.id

    let isPharmacyStoreOwner = false
    if (order.module === "PHARMACY") {
      const vendorPharmacy = await prisma.pharmacy.findFirst({
        where: { userId: user.id },
        select: { id: true },
      })
      if (vendorPharmacy) {
        if (order.pharmacyId === vendorPharmacy.id) {
          isPharmacyStoreOwner = true
        } else {
          const linkedPickup = await prisma.multiplePickup.findFirst({
            where: {
              orderId: order.id,
              pharmacyId: vendorPharmacy.id,
            },
            select: { id: true },
          })
          isPharmacyStoreOwner = Boolean(linkedPickup)
        }
      }
    }

    // Pickup QR: child order — vendor on that child order only
    if (order.isChildOrder) {
      if (!isVendor) {
        return NextResponse.json({
          error: "Not authorized. Only the vendor can generate pickup QR codes for child orders",
        }, { status: 403 })
      }
    } else {
      // Single / parent order: customer (delivery QR) or vendor / pharmacy owner (pickup QR for rider)
      const allowed =
        isCustomer || isVendor || isPharmacyStoreOwner
      if (!allowed) {
        return NextResponse.json(
          { error: "Not authorized to generate QR for this order" },
          { status: 403 }
        )
      }
    }

    // Generate QR code data
    // Format: ORDER:{orderId}:{hash}
    // Hash is HMAC-SHA256 of orderId + orderNumber + secret
    const secret = process.env.QR_CODE_SECRET || 'default-secret-key-change-in-production'
    const hash = crypto
      .createHmac('sha256', secret)
      .update(`${order.id}:${order.orderNumber}`)
      .digest('hex')
      .substring(0, 16) // Use first 16 chars for shorter QR code

    const qrData = `ORDER:${order.id}:${hash}`

    return NextResponse.json({
      success: true,
      qrCode: qrData,
      orderId: order.id,
      orderNumber: order.orderNumber,
      module: order.module,
    })
  } catch (error) {
    console.error("Error generating QR code:", error)
    return NextResponse.json(
      { error: "Failed to generate QR code" },
      { status: 500 }
    )
  }
}
