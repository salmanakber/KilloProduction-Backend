import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { orderId, status, location, notes } = await request.json()

    if (!orderId || !status) {
      return NextResponse.json({ error: "Order ID and status are required" }, { status: 400 })
    }

    // Update order status
    const updateData: any = { status }

    if (status === "DELIVERED") {
      updateData.deliveredAt = new Date()
    }

    const order = await prisma.order.update({
      where: {
        id: orderId,
        riderId: session.user.id,
      },
      data: updateData,
    })

    // Create tracking entry
    await prisma.orderTracking.create({
      data: {
        orderId: order.id,
        status,
        location,
        notes,
        timestamp: new Date(),
      },
    })

    // If delivered, update rider stats
    if (status === "DELIVERED") {
      await prisma.riderProfile.update({
        where: { userId: session.user.id },
        data: {
          totalDeliveries: { increment: 1 },
          totalEarnings: { increment: order.deliveryFee },
        },
      })
    }

    return NextResponse.json({ order })
  } catch (error) {
    console.error("Error updating delivery status:", error)
    return NextResponse.json({ error: "Failed to update delivery status" }, { status: 500 })
  }
}
