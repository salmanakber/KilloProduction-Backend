import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authenticateRequest } from '@/lib/auth'
import { rejectIfRiderCommissionLockedAsync } from '@/lib/rider-app-access'

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest()
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const riderLockResponse = await rejectIfRiderCommissionLockedAsync(session)
    if (riderLockResponse) return riderLockResponse

    const { orderId } = await request.json()

    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 })
    }

    // Check if rider is available
    const riderProfile = await prisma.riderProfile.findUnique({
      where: { userId: session.id },
    })

    if (!riderProfile?.isAvailable) {
      return NextResponse.json({ error: "Rider is not available" }, { status: 400 })
    }

    // Update order with rider
    const order = await prisma.order.update({
      where: {
        id: orderId,
        riderId: null, // Only accept unassigned orders
        status: "CONFIRMED",
      },
      data: {
        riderId: session.id,
        status: "READY_FOR_PICKUP",
      },
      include: {
        customer: {
          select: { name: true, phone: true },
        },
        vendor: {
          select: { autoPartsStore: { select: { storeName: true } }, pharmacy: { select: { pharmacyName: true } }, restaurant: { select: { name: true } }, groceryStore: { select: { storeName: true } } },
        },
      },
    })

    // Create tracking entry
    await prisma.orderTracking.create({
      data: {
        orderId: order.id,
        status: "READY_FOR_PICKUP",
        notes: "Rider assigned and heading to pickup location",
        timestamp: new Date(),
      },
    })

    return NextResponse.json({ order })
  } catch (error) {
    console.error("Error accepting delivery:", error)
    return NextResponse.json({ error: "Failed to accept delivery" }, { status: 500 })
  }
}
