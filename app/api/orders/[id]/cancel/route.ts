import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { cancelOrder } from "@/lib/order-cancellation-service"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: orderId } = params
    const body = await request.json()
    const { reason, explanation } = body

    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 })
    }

    const result = await cancelOrder({
      orderId,
      userId: user.id,
      reason,
      explanation,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to cancel order" },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Order cancelled successfully",
      data: {
        order: result.order,
        courierBooking: result.courierBooking,
        payments: result.payments,
      },
    })
  } catch (error: any) {
    console.error("Error cancelling order:", error)
    return NextResponse.json(
      { error: error.message || "Failed to cancel order" },
      { status: 500 }
    )
  }
}
