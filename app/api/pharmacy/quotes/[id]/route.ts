import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || user.role !== "VENDOR" as any) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    // Get the supplier order with all related data
    const supplierOrder = await prisma.supplierOrder.findUnique({
      where: { 
        id: params.id,
        pharmacyId: pharmacy.id
      },
      include: {
        courierBooking: true,
        wholesaler: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phone: true
              }
            }
          }
        },
        pharmacy: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phone: true
              }
            }
          }
        },
        items: true
      }
    })

    if (!supplierOrder) {
      return NextResponse.json(
        { error: "Quote not found" },
        { status: 404 }
      )
    }
    
    // Format the response
    const quote = {
      id: supplierOrder.id,
      orderNumber: supplierOrder.orderNumber,
      status: supplierOrder.status,
      totalAmount: supplierOrder.totalAmount,
      notes: supplierOrder.notes,
      createdAt: supplierOrder.createdAt,
      updatedAt: supplierOrder.updatedAt,
      deliveryAddress: supplierOrder.deliveryAddress,
      deliveryLatitude: supplierOrder.deliveryLatitude,
      deliveryLongitude: supplierOrder.deliveryLongitude,
      pickupAddress: supplierOrder.pickupAddress,
      pickupLatitude: supplierOrder.pickupLatitude,
      pickupLongitude: supplierOrder.pickupLongitude,
      supplierResponse: supplierOrder.supplierResponse,
      wholesaler: {
        id: supplierOrder.wholesaler.id,
        companyName: supplierOrder.wholesaler.companyName,
        phone: supplierOrder.wholesaler.phone,
        email: supplierOrder.wholesaler.email,
        address: supplierOrder.wholesaler.address,
        user: supplierOrder.wholesaler.user

      },
      pharmacy: {
        id: supplierOrder.pharmacy.id,
        pharmacyName: supplierOrder.pharmacy.pharmacyName,
        phone: supplierOrder.pharmacy.phone,
        email: supplierOrder.pharmacy.email,
        address: supplierOrder.pharmacy.address,
        description: supplierOrder.pharmacy.description,
        website: supplierOrder.pharmacy.website,
        is24Hours: supplierOrder.pharmacy.is24Hours,
        deliveryAvailable: supplierOrder.pharmacy.deliveryAvailable,
        user: supplierOrder.pharmacy.user
      },
      items: supplierOrder.items.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice
      })),
      courierBooking: supplierOrder.courierBooking
    }

    return NextResponse.json({
      quote
    })
  } catch (error) {
    console.error("Quote fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch quote" },
      { status: 500 }
    )
  }
}
