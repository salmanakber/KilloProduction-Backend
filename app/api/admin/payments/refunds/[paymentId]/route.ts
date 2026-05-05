import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { executeRefundApproval, getRefundMeta } from "@/lib/admin-refund-approve"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { paymentId: string } },
) {
  const { session, error } = await requireAdmin()
  if (error) return error
  try {
    const body = await request.json()
    const action = String(body?.action || "").toUpperCase()
    const adminNote = typeof body?.adminNote === "string" ? body.adminNote.trim() : ""

    if (!["APPROVE", "REJECT"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const payment = await prisma.payment.findUnique({
      where: { id: params.paymentId },
      include: { user: true },
    })
    if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 })

    const refund = getRefundMeta(payment.metadata)
    if (!refund) return NextResponse.json({ error: "Refund request not found on payment" }, { status: 404 })
    if (String(refund.status || "PENDING") !== "PENDING") {
      return NextResponse.json({ error: "Refund already processed" }, { status: 400 })
    }

    if (action === "REJECT") {
      const prevMeta =
        payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
          ? (payment.metadata as Record<string, unknown>)
          : {}
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          metadata: {
            ...prevMeta,
            refund: {
              ...refund,
              status: "REJECTED",
              adminNote,
              processedAt: new Date().toISOString(),
              processedBy: session!.id,
            },
          },
        },
      })
      const trackingOrderId = String(refund.sourceOrderId || payment.orderId || "")
      if (trackingOrderId) {
        await prisma.orderTracking.create({
          data: {
            orderId: trackingOrderId,
            status: "CANCELLED",
            notes: "Refund request rejected by admin.",
            timestamp: new Date(),
          },
        }).catch(() => {})
      }
      return NextResponse.json({ success: true, status: "REJECTED" })
    }

    const result = await executeRefundApproval({
      payment,
      processedBy: session!.id,
      adminNote,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const { shouldDeferSettlement, txResult, refundCourierBookingId } = result

    return NextResponse.json({
      success: true,
      status: shouldDeferSettlement ? "APPROVED" : txResult === "WALLET" ? "COMPLETED" : "APPROVED",
      refundCourierBookingId,
    })
  } catch (e) {
    console.error("admin refund PATCH:", e)
    return NextResponse.json({ error: "Failed to process refund action" }, { status: 500 })
  }
}
