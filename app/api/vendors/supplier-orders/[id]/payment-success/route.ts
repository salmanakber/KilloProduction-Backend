import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { paymentReference, paymentMethod } = body

    // Get the supplier order
    const supplierOrder = await prisma.supplierOrder.findUnique({
      where: { 
        id: params.id,
        pharmacy: { userId: user.id },
        status: "CONFIRMED"
      },
      include: {
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true,
            address: true,
            phone: true
          }
        },
        wholesaler: {
          select: {
            id: true,
            companyName: true,
            address: true,
            phone: true
          }
        }
      }
    })

    if (!supplierOrder) {
      return NextResponse.json(
        { error: "Order not found or not confirmed" },
        { status: 404 }
      )
    }

    // Update payment status
    await prisma.supplierOrder.update({
      where: { id: params.id },
      data: {
        paymentStatus: "PAID",
        paymentMethod
      }
    })

    // Create courier booking
    const courierBooking = await prisma.courierBooking.create({
      data: {
        bookingNumber: `CB-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        customerId: user.id,
        pickupAddress: supplierOrder.wholesaler.address || "Supplier Address",
        pickupLatitude: 0, // Will be updated by supplier
        pickupLongitude: 0, // Will be updated by supplier
        dropAddress: supplierOrder.deliveryAddress || supplierOrder.pharmacy.address,
        dropLatitude: 0, // Will be updated by pharmacy
        dropLongitude: 0, // Will be updated by pharmacy
        distance: 0, // Will be calculated
        estimatedTime: 0, // Will be calculated
        fare: 0, // Will be calculated
        status: "REQUESTED",
        paymentStatus: "PENDING",
        packageType: "Pharmacy Supplies",
        recipientName: supplierOrder.pharmacy.pharmacyName,
        recipientPhone: supplierOrder.pharmacy.phone,
        notes: `Supplier order: ${supplierOrder.orderNumber}`,
        scheduledAt: supplierOrder.expectedDeliveryDate
      }
    })

    // Link courier booking to supplier order
    await prisma.supplierOrder.update({
      where: { id: params.id },
      data: {
        courierBookingId: courierBooking.id
      }
    })

    // Find available riders for pharmacy delivery
    const availableRiders = await prisma.riderProfile.findMany({
      where: {
        isAvailable: true,
        isOnline: true,
        isVerified: true,
        isApproved: true,
        serviceTypes: {
          array_contains: ["pharmacy"]
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    // Send notifications to available riders
    for (const rider of availableRiders) {
      await NotificationBridge.notifyRiderNewDelivery(
        rider.userId,
        courierBooking.id,
        supplierOrder.wholesaler.address || "Supplier Address"
      )
    }

    // Send notification to supplier
    await NotificationBridge.sendNotification({
      userId: supplierOrder.wholesaler.userId,
      title: "Payment Received",
      message: `Payment received for order ${supplierOrder.orderNumber}`,
      type: "PAYMENT",
      module: "WHOLESALER",
      data: { 
        orderId: supplierOrder.id,
        paymentReference
      },
      actionUrl: `/wholesaler/orders/${supplierOrder.id}`
    })

    return NextResponse.json({
      message: "Payment processed successfully",
      courierBooking: {
        id: courierBooking.id,
        bookingNumber: courierBooking.bookingNumber,
        status: courierBooking.status
      },
      availableRiders: availableRiders.length
    })
  } catch (error) {
    console.error("Payment success error:", error)
    return NextResponse.json(
      { error: "Failed to process payment" },
      { status: 500 }
    )
  }
}
