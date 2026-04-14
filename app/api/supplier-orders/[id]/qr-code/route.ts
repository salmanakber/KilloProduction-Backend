import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import crypto from "crypto"

/**
 * GET /api/supplier-orders/[id]/qr-code
 * Generate QR code data for a supplier order
 * QR code contains: supplierOrderId + secret hash for verification
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

    const supplierOrderId = params.id

    // Get the supplier order
    const supplierOrder = await prisma.supplierOrder.findUnique({
      where: { id: supplierOrderId },
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
        status: true,
      },
    })

    if (!supplierOrder) {
      return NextResponse.json({ error: "Supplier order not found" }, { status: 404 })
    }

    // Verify user has access (pharmacy vendor only)
    const isPharmacyVendor = supplierOrder.pharmacy.userId === user.id
    
    if (!isPharmacyVendor) {
      return NextResponse.json({ 
        error: "Not authorized. Only the pharmacy vendor can generate QR codes for their orders" 
      }, { status: 403 })
    }

    // Generate QR code data
    // Format: SUPPLIER_ORDER:{supplierOrderId}:{hash}
    // Hash is HMAC-SHA256 of supplierOrderId + orderNumber + secret
    const secret = process.env.QR_CODE_SECRET || 'default-secret-key-change-in-production'
    const hash = crypto
      .createHmac('sha256', secret)
      .update(`${supplierOrder.id}:${supplierOrder.orderNumber}`)
      .digest('hex')
      .substring(0, 16) // Use first 16 chars for shorter QR code

    const qrData = `SUPPLIER_ORDER:${supplierOrder.id}:${hash}`

    return NextResponse.json({
      success: true,
      qrCode: qrData,
      supplierOrderId: supplierOrder.id,
      orderNumber: supplierOrder.orderNumber,
      module: 'WHOLESALER',
    })
  } catch (error) {
    console.error("Error generating supplier order QR code:", error)
    return NextResponse.json(
      { error: "Failed to generate QR code" },
      { status: 500 }
    )
  }
}
