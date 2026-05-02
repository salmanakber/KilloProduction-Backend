import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { NotificationBridge } from "@/lib/notification-bridge"
import type { Prisma } from "@prisma/client"
import Stripe from "stripe"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { issueRideStartOtp } from "@/lib/ride-start-otp"

function getRefundMeta(meta: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null
  const obj = meta as Record<string, unknown>
  if (!obj.refund || typeof obj.refund !== "object" || Array.isArray(obj.refund)) return null
  return obj.refund as Record<string, unknown>
}

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

    const sys = await prisma.systemSettings.findFirst({ select: { compnyinfo: true } })
    const comp =
      sys?.compnyinfo && typeof sys.compnyinfo === "object" && !Array.isArray(sys.compnyinfo)
        ? (sys.compnyinfo as Record<string, unknown>)
        : {}
    const refundSettings =
      comp.refundSettings && typeof comp.refundSettings === "object" && !Array.isArray(comp.refundSettings)
        ? (comp.refundSettings as Record<string, unknown>)
        : {}
    const deliveryFeeBearer = refundSettings.deliveryFeeBearer === "VENDOR" ? "VENDOR" : "CUSTOMER"
    const refundPlatformCommission = refundSettings.refundPlatformCommission !== false

    const sourceOrderId = String(refund.sourceOrderId || payment.orderId || "")
    const sourceOrder = sourceOrderId
      ? await prisma.order.findUnique({
          where: { id: sourceOrderId },
          select: {
            id: true,
            subtotal: true,
            deliveryFee: true,
            platformCommission: true,
            vendorId: true,
            module: true,
            vendor: {
              select: {
                id: true,
                autoPartsStore: {
                  select: {
                    storeName: true,
                    address: true,
                    latitude: true,
                    longitude: true,
                  },
                },
              },
            },
            food: {
              select: {
                name: true,
                address: true,
                latitude: true,
                longitude: true,
              },
            },
            grocery: {
              select: {
                storeName: true,
                address: true,
                latitude: true,
                longitude: true,
              },
            },
            pharmacy: {
              select: {
                pharmacyName: true,
                address: true,
                lat: true,
                lon: true,
              },
            },
            address: {
              select: {
                street: true,
                city: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        })
      : null
    const deliveryFee = Number(sourceOrder?.deliveryFee || 0)
    const platformCommission = Number(sourceOrder?.platformCommission || 0)
    const itemRefundBase =
      Number((refund.itemRefundBase as number) || 0) || Number(sourceOrder?.subtotal || 0)
    let refundAmount = itemRefundBase + (refundPlatformCommission ? platformCommission : 0)
    refundAmount = Math.max(0, Number(refundAmount.toFixed(2)))
    const shouldDeferSettlement = Boolean(sourceOrder?.address && sourceOrderId)

    // APPROVE flow
    const refundMethod = String(refund.refundMethod || "ORIGINAL_PAYMENT")

    if (!shouldDeferSettlement && refundMethod === "ORIGINAL_PAYMENT" && String(payment.gateway || "").toUpperCase() === "STRIPE") {
      const secret = process.env.STRIPE_SECRET_KEY || ""
      if (secret && payment.gatewayTransactionId) {
        const stripe = new Stripe(secret, { apiVersion: "2023-10-16" })
        await stripe.refunds.create({
          payment_intent: payment.gatewayTransactionId,
          amount: Math.round(refundAmount * 100),
          metadata: { paymentId: payment.id, orderId: payment.orderId || "" },
        })
      }
    }
    const txResult = await prisma.$transaction(async (tx) => {
      const prevMeta =
        payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
          ? (payment.metadata as Record<string, unknown>)
          : {}

      // Reversal from vendor wallet if there was vendor credit for this order
      if (!shouldDeferSettlement && sourceOrderId && sourceOrder?.vendorId) {
        const vendorWallet = await tx.wallet.findUnique({ where: { userId: sourceOrder.vendorId } })
        if (vendorWallet) {
          const credited = await tx.walletTransaction.findFirst({
            where: {
              userId: sourceOrder.vendorId,
              orderId: sourceOrderId,
              status: "COMPLETED",
              amount: { gt: 0 },
            },
            orderBy: { createdAt: "desc" },
          })
          if (credited) {
            const extraVendorFee = deliveryFeeBearer === "VENDOR" ? deliveryFee : 0
            const debitAmount = Math.abs(credited.amount) + Math.abs(extraVendorFee)
            const nextVendorBalance = vendorWallet.balance - debitAmount
            await tx.wallet.update({
              where: { id: vendorWallet.id },
              data: { balance: nextVendorBalance },
            })
            await tx.walletTransaction.create({
              data: {
                userId: sourceOrder.vendorId,
                type: "DEBIT",
                amount: -Math.abs(debitAmount),
                balance: nextVendorBalance,
                description: `Refund reversal for order ${sourceOrderId}`,
                reference: `VENDOR_REFUND_REVERSAL_${payment.id}`,
                orderId: sourceOrderId,
                status: "COMPLETED",
                metadata: {
                  sourceWalletTransactionId: credited.id,
                  refundPaymentId: payment.id,
                  deliveryFeeBearer,
                  deliveryFeeDeducted: extraVendorFee,
                },
              },
            })
          }
        }
      }

      if (!shouldDeferSettlement && refundMethod === "WALLET") {
        const customerWallet = await tx.wallet.upsert({
          where: { userId: payment.userId },
          update: {},
          create: { userId: payment.userId, balance: 0, currency: payment.currency },
        })
        const newBalance = customerWallet.balance + refundAmount
        await tx.wallet.update({ where: { id: customerWallet.id }, data: { balance: newBalance } })
        await tx.walletTransaction.create({
          data: {
            userId: payment.userId,
            type: "REFUND",
            amount: refundAmount,
            balance: newBalance,
            description: `Refund to wallet for order ${sourceOrderId || "N/A"}`,
            reference: `WALLET_REFUND_${payment.id}`,
            orderId: sourceOrderId || undefined,
            status: "COMPLETED",
            metadata: {
              paymentId: payment.id,
              refundMethod,
              deliveryFeeBearer,
              refundPlatformCommission,
              computedRefundAmount: refundAmount,
            },
          },
        })
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: shouldDeferSettlement ? payment.status : "REFUNDED",
          metadata: {
            ...prevMeta,
            refund: {
              ...refund,
              status: shouldDeferSettlement ? "APPROVED" : refundMethod === "WALLET" ? "COMPLETED" : "APPROVED",
              adminNote,
              processedAt: new Date().toISOString(),
              processedBy: session!.id,
              deliveryFeeBearer,
              refundPlatformCommission,
              computedRefundAmount: refundAmount,
              itemRefundBase,
              settlementPendingPickupOtp: shouldDeferSettlement,
            },
          },
        },
      })
      return refundMethod
    })

    let refundCourierBookingId: string | null = null
    // Broadcast a refund courier request if rider is not yet assigned.
    try {
      if (sourceOrder?.address && sourceOrderId) {
        const rideType = await prisma.rideType.findFirst({
          where: { category: "COURIER", isActive: true },
          select: { id: true },
        })
        if (rideType) {
          const pickupAddress = `${sourceOrder.address.street}, ${sourceOrder.address.city}`
          const pickupLatitude = Number(sourceOrder.address.latitude || 0)
          const pickupLongitude = Number(sourceOrder.address.longitude || 0)
          const moduleName = String(sourceOrder.module || "").toUpperCase()
          const autoPartsStore = sourceOrder.vendor?.autoPartsStore
          const dropAddress =
            moduleName === "AUTO_PARTS"
              ? String(autoPartsStore?.address || "")
              : moduleName === "GROCERY"
                ? String(sourceOrder.grocery?.address || "")
                : moduleName === "PHARMACY"
                  ? String(sourceOrder.pharmacy?.address || "")
                  : moduleName === "FOOD"
                    ? String(sourceOrder.food?.address || "")
                    : ""
          const dropLatitude =
            moduleName === "AUTO_PARTS"
              ? Number(autoPartsStore?.latitude || 0)
              : moduleName === "GROCERY"
                ? Number(sourceOrder.grocery?.latitude || 0)
                : moduleName === "PHARMACY"
                  ? Number(sourceOrder.pharmacy?.lat || 0)
                  : moduleName === "FOOD"
                    ? Number(sourceOrder.food?.latitude || 0)
                    : 0
          const dropLongitude =
            moduleName === "AUTO_PARTS"
              ? Number(autoPartsStore?.longitude || 0)
              : moduleName === "GROCERY"
                ? Number(sourceOrder.grocery?.longitude || 0)
                : moduleName === "PHARMACY"
                  ? Number(sourceOrder.pharmacy?.lon || 0)
                  : moduleName === "FOOD"
                    ? Number(sourceOrder.food?.longitude || 0)
                    : 0
          const finalDropAddress = dropAddress || pickupAddress
          const finalDropLatitude = dropLatitude || pickupLatitude
          const finalDropLongitude = dropLongitude || pickupLongitude
          if (pickupLatitude && pickupLongitude) {
            const refundBooking = await prisma.courierBooking.create({
              data: {
                bookingNumber: `RF-CB-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
                customerId: payment.userId,
                rideTypeId: rideType.id,
                pickupAddress,
                pickupLatitude,
                pickupLongitude,
                dropAddress: finalDropAddress,
                dropLatitude: finalDropLatitude,
                dropLongitude: finalDropLongitude,
                distance: 1,
                estimatedTime: 10,
                fare: deliveryFeeBearer === "CUSTOMER" ? deliveryFee : 0,
                status: "REQUESTED",
                paymentStatus: "PENDING",
                paymentMethod: "REFUND_RETURN",
                notes: "Refund return pickup",
                orderId: sourceOrderId,
                module: "REFUND",
                recipientName: payment.user?.name || "Customer",
              },
            })
            refundCourierBookingId = refundBooking.id
            const otpIssued = issueRideStartOtp(`COURIER_BOOKING:${refundBooking.id}`)
            await prisma.payment.update({
              where: { id: payment.id },
              data: {
                metadata: {
                  ...(payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
                    ? (payment.metadata as Record<string, unknown>)
                    : {}),
                  refund: {
                    ...(refund as Record<string, unknown>),
                    refundCourierBookingId: refundBooking.id,
                    refundPickupOtpIssuedAt: new Date().toISOString(),
                    refundPickupOtpExpiresAt: otpIssued.expiresAt,
                  },
                },
              },
            })

            if (sourceOrderId) {
              await prisma.order.update({
                where: { id: sourceOrderId },
                data: { status: "CANCELLED", paymentStatus: "PENDING" },
              }).catch(() => {})
              await prisma.orderTracking.create({
                data: {
                  orderId: sourceOrderId,
                  status: "CANCELLED",
                  notes: "Refund approved. Awaiting refund pickup and OTP verification.",
                  timestamp: new Date(),
                },
              }).catch(() => {})
            }
              // If you want it to only go to NEARBY riders, do this instead:
              const socketServer = getGlobalSocketServer();
              if (socketServer) {
                await socketServer.broadcastCourierNewRequestToRiders({
                  type: "new_request",
                  requestType: "refund_courier",
                  bookingId: refundBooking.id,
                  bookingNumber: refundBooking.bookingNumber,
                  pickupLatitude: refundBooking.pickupLatitude, // Needs this for radius math
                  pickupLongitude: refundBooking.pickupLongitude, // Needs this for radius math
                  pickupAddress: refundBooking.pickupAddress,
                  dropAddress: refundBooking.dropAddress,
                  dropLatitude: refundBooking.dropLatitude,
                  dropLongitude: refundBooking.dropLongitude,
                  message: "New refund pickup request",
                  metadata: {
                    refundPaymentId: payment.id,
                    otpMode: "REFUND",
                  },
                });
              }
            
            await NotificationBridge.sendNotification({
              userId: payment.userId,
              title: "Refund Pickup OTP",
              message: `Share this OTP with rider at pickup: ${otpIssued.otp}`,
              type: "refund_pickup_otp",
              module: "RIDING",
              data: {
                bookingId: refundBooking.id,
                otp: otpIssued.otp,
                expiresAt: otpIssued.expiresAt,
              },
              actionUrl: "OrderDetails",
            }).catch(() => {})
          }
        }
      }
    } catch (broadcastErr) {
      console.error("refund broadcast error:", broadcastErr)
    }

    await NotificationBridge.sendNotification({
      userId: payment.userId,
      title: "Refund Updated",
      message:
        shouldDeferSettlement
          ? "Refund approved. Please hand over the item to rider and share OTP for final settlement."
          : txResult === "WALLET"
          ? "Your refund was approved and deposited to wallet."
          : "Your refund was approved. Card/Bank processing can take up to 7 business days.",
      type: "refund_processed",
      module: sourceOrder?.module || "ADMIN",
      data: { orderId: sourceOrderId, paymentId: payment.id },
      actionUrl: "OrderDetails",
    }).catch(() => {})
    const approvalTrackingOrderId = String(refund.sourceOrderId || payment.orderId || "")
    if (approvalTrackingOrderId && !shouldDeferSettlement) {
      await prisma.orderTracking.create({
        data: {
          orderId: approvalTrackingOrderId,
          status: "CANCELLED",
          notes: `Refund approved. Settled amount: ${refundAmount.toFixed(2)}.`,
          timestamp: new Date(),
        },
      }).catch(() => {})
    }

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
