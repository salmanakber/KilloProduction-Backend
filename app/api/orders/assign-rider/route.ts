import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest()
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { orderId, riderId, assignmentType } = await request.json()

    // Get the order
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        vendor: true,
        customer: true,
        address: true,
      },
    })

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Verify vendor owns the order (for manual assignment)
    if (assignmentType === "MANUAL" && order.vendorId !== session.id) {
      return NextResponse.json({ error: "Not authorized to assign rider to this order" }, { status: 403 })
    }

    let assignedRider: any | null = null

    if (assignmentType === "MANUAL" && riderId) {
      // Manual assignment by vendor
      const rider = await prisma.user.findUnique({
        where: { id: riderId },
        include: { riderProfile: true },
      })

      if (!rider || rider.role !== "RIDER" || !rider.riderProfile?.isApproved || !rider.id) {
        return NextResponse.json({ error: "Invalid rider" }, { status: 400 })
      }

      assignedRider = rider
    } else {
      // Auto assignment - find nearest available rider
      assignedRider = await findNearestAvailableRider(order)

      if (!assignedRider) {
        return NextResponse.json({ error: "No available riders found" }, { status: 404 })
      }
    }

    // Update order with assigned rider
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        riderId: assignedRider.id,
        status: "CONFIRMED",
      },
      include: {
        rider: {
          include: { riderProfile: true },
        },
        vendor: true,
        customer: true,
        address: true,
      },
    })

    // Create delivery tracking entry
    await prisma.orderTracking.create({
      data: {
        orderId,
        status: "CONFIRMED",
        notes: `Order assigned to rider ${assignedRider.name}`,
      },
    })

    // Send notification to rider
    await sendDeliveryNotificationToRider(assignedRider.id, updatedOrder)

    // Send notification to customer
    await sendDeliveryNotificationToCustomer(order.customerId, updatedOrder)

    return NextResponse.json({
      order: updatedOrder,
      message: "Rider assigned successfully",
    })
  } catch (error) {
    console.error("Error assigning rider:", error)
    return NextResponse.json({ error: "Failed to assign rider" }, { status: 500 })
  }
}

async function findNearestAvailableRider(order: any) {
  // Get vendor location (simplified - in production, use actual coordinates)
  const vendorLocation = { lat: 0, lng: 0 } // TODO: Get from vendor profile

  // Find available riders who deliver for this module
  const availableRiders = await prisma.user.findMany({
    where: {
      role: "RIDER",
      riderProfile: {
        isOnline: new Date().toISOString(),
        isAvailable: true,
        isApproved: true,
        serviceTypes: { has: "MODULE_DELIVERY" },
        modules: { has: order.module },
      },
    },
    include: {
      riderProfile: true,
    },
  })

  if (availableRiders.length === 0) {
    return null
  }

  // For now, return the first available rider
  // In production, calculate actual distance and return nearest
  return availableRiders[0]
}

async function sendDeliveryNotificationToRider(riderId: string, order: any) {
  await prisma.notification.create({
    data: {
      userId: riderId,
      title: "New Delivery Request",
      message: `You have a new delivery from ${order.vendor?.name || "a vendor"}`,
      type: "DELIVERY",
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        module: order.module,
        pickupAddress: order.vendor?.address,
        deliveryAddress: order.address?.street,
        deliveryFee: order.deliveryFee,
      },
    },
  })

  // TODO: Send push notification
}

async function sendDeliveryNotificationToCustomer(customerId: string, order: any) {
  await prisma.notification.create({
    data: {
      userId: customerId,
      title: "Rider Assigned",
      message: `${order.rider?.name} will deliver your order`,
      type: "ORDER_UPDATE",
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        riderName: order.rider?.name,
        riderPhone: order.rider?.phone,
        vehicleInfo: `${order.rider?.riderProfile?.vehicleBrand} ${order.rider?.riderProfile?.vehicleModel}`,
        licensePlate: order.rider?.riderProfile?.licensePlate,
      },
    },
  })

  // TODO: Send push notification
}
