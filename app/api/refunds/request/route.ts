import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"

function genRequestId(): string {
  return `RF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const orderId = String(body?.orderId || "").trim()
    const module = String(body?.module || "").trim().toUpperCase()
    const reason = String(body?.reason || "Customer requested refund").trim()
    const refundMethod = body?.refundMethod === "WALLET" ? "WALLET" : "ORIGINAL_PAYMENT"
    if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 })

    const matchingPayments = await prisma.payment.findMany({
      where: {
        userId: user.id,
        status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
        OR: [
          { orderId },
          { metadata: { path: ["parentOrderId"], equals: orderId } },
          { metadata: { path: ["courierBookingId"], equals: orderId } },
          { metadata: { path: ["rideBookingId"], equals: orderId } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderId: true,
        amount: true,
        currency: true,
        metadata: true,
      },
    })
    const payment = matchingPayments.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0]
    if (!payment) {
      return NextResponse.json({ error: "No paid payment record found for order" }, { status: 400 })
    }

    const sys = await prisma.systemSettings.findFirst({ select: { compnyinfo: true } })
    const comp =
      sys?.compnyinfo && typeof sys.compnyinfo === "object" && !Array.isArray(sys.compnyinfo)
        ? (sys.compnyinfo as Record<string, unknown>)
        : {}
    const enabled =
      comp.refundSettings &&
      typeof comp.refundSettings === "object" &&
      !Array.isArray(comp.refundSettings)
        ? ((comp.refundSettings as Record<string, unknown>).enabledModules as Record<string, unknown> | undefined)
        : undefined
    const refundSettings =
      comp.refundSettings &&
      typeof comp.refundSettings === "object" &&
      !Array.isArray(comp.refundSettings)
        ? (comp.refundSettings as Record<string, unknown>)
        : {}
    const refundPlatformCommission = refundSettings.refundPlatformCommission !== false
    const deliveryFeeBearer = refundSettings.deliveryFeeBearer === "VENDOR" ? "VENDOR" : "CUSTOMER"
    const paymentMeta =
      payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
        ? (payment.metadata as Record<string, unknown>)
        : {}
    const moduleKey = (module || String(paymentMeta.module || "")).toUpperCase()
    if (enabled && moduleKey && enabled[moduleKey] === false) {
      return NextResponse.json({ error: `Refunds are disabled for ${moduleKey}` }, { status: 403 })
    }

    const sourceOrderId = String(payment.orderId || orderId)
    const sourceOrder = sourceOrderId
      ? await prisma.order.findUnique({
          where: { id: sourceOrderId },
          select: { id: true, subtotal: true, platformCommission: true, deliveryFee: true },
        })
      : null
    const reqId = genRequestId()
    const prevMeta = paymentMeta
    const orderSubtotal = Number(sourceOrder?.subtotal || 0)
    const orderPlatformCommission = Number(sourceOrder?.platformCommission || 0)
    const orderDeliveryFee = Number(sourceOrder?.deliveryFee || 0)
    const itemRefundBase = Math.max(0, Number(orderSubtotal.toFixed(2)))
    const requestedRefundAmount = Math.max(
      0,
      Number((itemRefundBase + (refundPlatformCommission ? orderPlatformCommission : 0)).toFixed(2)),
    )
    const refundMeta = {
      requestId: reqId,
      status: "PENDING",
      refundMethod,
      reason,
      requestedAt: new Date().toISOString(),
      requestedBy: user.id,
      module: String(module || paymentMeta.module || ""),
      sourceOrderId,
      itemRefundBase,
      requestedRefundAmount,
      orderDeliveryFee,
      orderPlatformCommission,
      deliveryFeeBearer,
      refundPlatformCommission,
    }
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          metadata: { ...prevMeta, refund: refundMeta },
        },
      })
      if (sourceOrderId) {
        await tx.orderTracking.create({
          data: {
            orderId: sourceOrderId,
            status: "PENDING",
            notes: `Refund requested (${refundMethod}) for ${requestedRefundAmount.toFixed(2)}.`,
            timestamp: new Date(),
          },
        }).catch(() => {})
      }
    })

    await NotificationBridge.sendNotification({
      userId: user.id,
      title: "Refund Request Submitted",
      message:
        refundMethod === "WALLET"
          ? "Wallet refunds are processed quickly (usually within 5 minutes)."
          : "Card/Bank refunds may take up to 7 business days.",
      type: "refund_requested",
      module: "ADMIN",
      data: { requestId: reqId, orderId, paymentId: payment.id },
      actionUrl: "OrderDetails",
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      requestId: reqId,
      paymentId: payment.id,
      message:
        refundMethod === "WALLET"
          ? "Refund request submitted. Wallet payout target: within 5 minutes."
          : "Refund request submitted. Original payment method can take up to 7 business days.",
    })
  } catch (e) {
    console.error("refund request POST:", e)
    return NextResponse.json({ error: "Failed to submit refund request" }, { status: 500 })
  }
}
