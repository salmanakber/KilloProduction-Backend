import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { socketIOServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"
import { sendEmailFromTemplate } from "@/lib/email"
import { runCourierCompletionSideEffects } from "@/lib/courier-post-completion"
import { notifyCourierDeliveryCompleted } from "@/lib/courier-delivery-completion-notifications"
import { verifyRideStartOtp } from "@/lib/ride-start-otp"
import Stripe from "stripe"

function getRefundMeta(meta: any): Record<string, any> | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null
  if (!meta.refund || typeof meta.refund !== "object" || Array.isArray(meta.refund)) return null
  return meta.refund as Record<string, any>
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: courierBookingId } = params
    const { status, rideStartOtp } = await request.json()

    // Verify user has permission to update this booking
    // Only riders who have submitted bids should be able to update status to BIDDING
    if (status === "BIDDING") {
      const bid = await prisma.courierBid.findFirst({
        where: {
          courierBookingId,
          riderId: user.id,
          status: "PENDING",
        },
      })

      if (!bid) {
        return NextResponse.json({ 
          error: "You can only update status to BIDDING if you have submitted a bid" 
        }, { status: 403 })
      }
    }

    // Check if courier booking exists
    const courierBooking = await prisma.courierBooking.findUnique({
      where: { id: courierBookingId },
      include: {
        supplierOrders: {
          include: {
            wholesaler: {
              select: {
                userId: true,
                id: true,
              }
            },
            pharmacy: {
              select: {
                userId: true,
                id: true,
              }
            }
          }
        }
      }
    })

    if (!courierBooking) {
      return NextResponse.json({ error: "Courier booking not found" }, { status: 404 })
    }

    const courierModule = String(courierBooking.module || "").toUpperCase()
    const requiresPickupOtp = courierModule === "RIDE" || courierModule === "REFUND"
    if (
      requiresPickupOtp &&
      status === "PICKED_UP" &&
      courierBooking.status === "ARRIVED_AT_PICKUP"
    ) {
      const otp = String(rideStartOtp || "").trim()
      if (!otp || !(await verifyRideStartOtp(`COURIER_BOOKING:${courierBookingId}`, otp))) {
        return NextResponse.json({ error: "Valid ride start OTP is required" }, { status: 400 })
      }
    }

    // Update the status
    const updatedBooking = await prisma.courierBooking.update({
      where: { id: courierBookingId },
      data: { 
        status,
        updatedAt: new Date(),
    
        supplierOrders: {
          updateMany: {
            where: {
              courierBookingId: courierBookingId,
            },
            data: {
              ...(status === 'COMPLETED' && { status: 'DELIVERED' }),
            },
          },
        },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        rider: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        bids: {
          include: {
            rider: true
          }
        },
        // optional if needed
        supplierOrders: true
      }
    });

    if (
      courierModule === "REFUND" &&
      status === "PICKED_UP" &&
      courierBooking.status === "ARRIVED_AT_PICKUP"
    ) {
      try {
        const payment = await prisma.payment.findFirst({
          where: {
            metadata: {
              path: ["refund", "refundCourierBookingId"],
              equals: courierBookingId,
            },
          },
          include: { order: true },
        })
        if (payment) {
          const refund = getRefundMeta(payment.metadata)
          const pending = Boolean(refund?.settlementPendingPickupOtp)
          const refundMethod = String(refund?.refundMethod || "ORIGINAL_PAYMENT")
          const refundAmount = Number(refund?.computedRefundAmount || payment.amount || 0)
          const deliveryFee = Number(payment.order?.deliveryFee || 0)
          const deliveryFeeBearer = String(refund?.deliveryFeeBearer || "CUSTOMER")
          const refundPlatformCommission = refund?.refundPlatformCommission !== false

          if (pending) {
            await prisma.$transaction(async (tx) => {
              if (payment.orderId && payment.order?.vendorId) {
                const vendorWallet = await tx.wallet.findUnique({ where: { userId: payment.order.vendorId } })
                if (vendorWallet) {
                  const credited = await tx.walletTransaction.findFirst({
                    where: {
                      userId: payment.order.vendorId,
                      orderId: payment.orderId,
                      status: "COMPLETED",
                      amount: { gt: 0 },
                    },
                    orderBy: { createdAt: "desc" },
                  })
                  if (credited) {
                    const extraVendorFee = deliveryFeeBearer === "VENDOR" ? deliveryFee : 0
                    const debitAmount = Math.abs(credited.amount) + Math.abs(extraVendorFee)
                    const nextVendorBalance = vendorWallet.balance - debitAmount
                    await tx.wallet.update({ where: { id: vendorWallet.id }, data: { balance: nextVendorBalance } })
                    await tx.walletTransaction.create({
                      data: {
                        userId: payment.order.vendorId,
                        type: "DEBIT",
                        amount: -Math.abs(debitAmount),
                        balance: nextVendorBalance,
                        description: `Refund reversal for order ${payment.orderId}`,
                        reference: `VENDOR_REFUND_REVERSAL_${payment.id}`,
                        orderId: payment.orderId,
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

              if (refundMethod === "WALLET") {
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
                    description: `Refund to wallet for order ${payment.orderId || "N/A"}`,
                    reference: `WALLET_REFUND_${payment.id}`,
                    orderId: payment.orderId ?? undefined,
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
              } else if (String(payment.gateway || "").toUpperCase() === "STRIPE" && payment.gatewayTransactionId) {
                const secret = process.env.STRIPE_SECRET_KEY || ""
                if (secret) {
                  const stripe = new Stripe(secret, { apiVersion: "2023-10-16" })
                  await stripe.refunds.create({
                    payment_intent: payment.gatewayTransactionId,
                    amount: Math.round(refundAmount * 100),
                    metadata: { paymentId: payment.id, orderId: payment.orderId || "" },
                  })
                }
              }

              await tx.payment.update({
                where: { id: payment.id },
                data: {
                  status: "REFUNDED",
                  metadata: {
                    ...(payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
                      ? (payment.metadata as Record<string, unknown>)
                      : {}),
                    refund: {
                      ...(refund || {}),
                      status: refundMethod === "WALLET" ? "COMPLETED" : "APPROVED",
                      settlementPendingPickupOtp: false,
                      settledAt: new Date().toISOString(),
                      settledByRiderId: user.id,
                    },
                  },
                },
              })
              if (payment.orderId) {
                await tx.orderTracking.create({
                  data: {
                    orderId: payment.orderId,
                    status: "CANCELLED",
                    notes: `Refund settlement completed after pickup OTP verification (${refundAmount.toFixed(2)}).`,
                    timestamp: new Date(),
                  },
                }).catch(() => {})
              }
            })
          }
        }
      } catch (settlementError) {
        console.error("refund pickup settlement error:", settlementError)
      }
    }


    
    // Handle regular Order (if orderId exists)
    let updatedOrder: any = null
    if (updatedBooking.orderId && courierModule !== "REFUND") {
      const order = await prisma.order.findUnique({
        where: { id: updatedBooking.orderId },
        select: { partRequestId: true },
      });
      
      const deliveredAt =
        updatedBooking.status === "COMPLETED" ? new Date() : undefined

      updatedOrder = await prisma.order.update({
        where: { id: updatedBooking.orderId },
        data: {
          status:
            updatedBooking.status === 'COMPLETED'
              ? 'DELIVERED'
              : 'PENDING',
      
          paymentStatus:
            updatedBooking.status === 'COMPLETED'
              ? 'PAID'
              : 'PENDING',

          ...(deliveredAt && { deliveredAt }),
      
          ...(order?.partRequestId && {
            partRequest: {
              update: {
                status:
                  updatedBooking.status === 'COMPLETED'
                    ? 'COMPLETED'
                    : undefined,
              },
            },
          }),
        },
        select: {
          id: true,
          module: true,
          vendorId: true,
          total: true,
          platformCommission: true,
          deliveryFee: true,
          isChildOrder: true,
          childId: true,
        },
      });

      if (updatedBooking.status === "COMPLETED" && deliveredAt) {
        await prisma.order.updateMany({
          where: {
            childId: updatedBooking.orderId,
            isChildOrder: true,
          },
          data: {
            status: "DELIVERED",
            paymentStatus: "PAID",
            deliveredAt,
          },
        })
      }
    }

    // Process commissions, wallet, rider earning PAID, and peak bonus (same paths as rider/booking PUT).
    if (
      (updatedBooking.status === "COMPLETED" || updatedBooking.status === "DELIVERED") &&
      updatedBooking.riderId
    ) {
      try {
        await runCourierCompletionSideEffects(courierBookingId)
      } catch (commissionError) {
        console.error('Error processing commissions on order completion:', commissionError)
      }
    }

    // Create order tracking entry for courier status update (only if orderId exists)
    if (updatedBooking.status && updatedBooking.orderId) {
      try {
        await prisma.orderTracking.create({
          data: {
            orderId: updatedBooking.orderId,
            status: updatedBooking.status === 'COMPLETED' ? 'DELIVERED' : (updatedBooking.status as any),
            notes: `Courier booking status updated to ${updatedBooking.status}`,
            timestamp: new Date(),
          },
        })
      } catch (error) {
        console.error("Error creating order tracking:", error)
      }
    }
    
    
    let orderType: string = '';
    if (updatedOrder?.partRequest) {
      orderType = 'AUTO_PARTS';
    }
    else{
      orderType = 'COURIER';
    }
    

    // Socket.IO event name = payload.type — must include type so clients receive "booking_status_update"
    const courierBookingStatusPayload = {
      type: "booking_status_update" as const,
      bookingId: updatedBooking.id,
      bookingType: "courier" as const,
      status: updatedBooking.status,
      bookingNumber: updatedBooking.bookingNumber,
      isBookedByAnother: status === "RIDER_ASSIGNED" || status === "ACCEPTED",
      assignedRiderId: updatedBooking.riderId,
      riderId: updatedBooking.riderId,
      timestamp: new Date().toISOString(),
    }
    const courierRiderIds = new Set<string>()
    for (const bid of updatedBooking.bids || []) {
      if (bid.rider?.id) courierRiderIds.add(bid.rider.id)
    }
    if (updatedBooking.riderId) courierRiderIds.add(updatedBooking.riderId)
    for (const rid of courierRiderIds) {
      try {
        await socketIOServer.sendNotificationToUser(rid, courierBookingStatusPayload)
      } catch (e) {
        console.error("courier booking_status_update socket:", e)
      }
    }

    // Send notification to customer about status update
    if (updatedBooking.customer) {
      try {
        if (status === "DELIVERED" || status === "COMPLETED") {
          try {
            await notifyCourierDeliveryCompleted(courierBookingId, { terminalStatus: status })
          } catch (reviewNotifyErr) {
            console.error("notifyCourierDeliveryCompleted:", reviewNotifyErr)
          }
          const isRideLikeCourier = String(courierBooking.module || "").toUpperCase() === "RIDE"
          if (isRideLikeCourier && updatedBooking.riderId) {
            try {
              await NotificationBridge.sendNotification({
                userId: updatedBooking.customer.id,
                title: "Rate Your Trip",
                message: `Your trip is complete. Please rate your rider.`,
                type: "REVIEW_REQUEST",
                module: "RIDING",
                actionUrl: `/riding/bookings/${courierBookingId}/rate`,
                data: {
                  actionType: "navigate",
                  screen: "RiderFeedbackScreen",
                  params: [{ name: "bookingId", value: courierBookingId }],
                },
              })
              await socketIOServer.sendNotificationToUser(updatedBooking.customer.id, {
                type: "review_request",
                bookingId: courierBookingId,
                bookingType: "courier",
                module: "RIDING",
                actionType: "navigate",
                screen: "RiderFeedbackScreen",
                params: [{ name: "bookingId", value: courierBookingId }],
                timestamp: new Date().toISOString(),
              })

              await NotificationBridge.sendNotification({
                userId: updatedBooking.riderId,
                title: "Rate Your Passenger",
                message: `Trip #${updatedBooking.bookingNumber} is complete. Please rate your customer.`,
                type: "REVIEW_REQUEST",
                module: "RIDING",
                actionUrl: `/riderfeedback?bookingId=${courierBookingId}&perspective=rider`,
                data: {
                  actionType: "navigate",
                  screen: "riderfeedback",
                  params: [
                    { name: "bookingId", value: courierBookingId },
                    { name: "perspective", value: "rider" },
                  ],
                },
              })
              await socketIOServer.sendNotificationToUser(updatedBooking.riderId, {
                type: "review_request",
                bookingId: courierBookingId,
                bookingType: "courier",
                module: "RIDING",
                actionType: "navigate",
                screen: "riderfeedback",
                params: [
                  { name: "bookingId", value: courierBookingId },
                  { name: "perspective", value: "rider" },
                ],
                timestamp: new Date().toISOString(),
              })
            } catch (reviewErr) {
              console.error("courier ride-like review notifications:", reviewErr)
            }
          }
        } else {
          // Regular status updates
          const statusMessages: {[key: string]: {title: string, message: string}} = {
            'EN_ROUTE_TO_PICKUP': {
              title: 'Rider On The Way',
              message: `Your rider is on the way to pickup location for booking #${updatedBooking.bookingNumber}`
            },
            'ARRIVED_AT_PICKUP': {
              title: 'Rider Arrived',
              message: `Your rider has arrived at the pickup location for booking #${updatedBooking.bookingNumber}`
            },
            'PICKED_UP': {
              title: 'Package Picked Up',
              message: `Your package has been picked up and is on the way for booking #${updatedBooking.bookingNumber}`
            },
            'EN_ROUTE_TO_DROPOFF': {
              title: 'On The Way',
              message: `Your delivery is on the way to you for booking #${updatedBooking.bookingNumber}`
            },
            'ARRIVED_AT_DROPOFF': {
              title: 'Rider Arrived',
              message: `Your rider has arrived at the dropoff location for booking #${updatedBooking.bookingNumber}`
            }
          }

          const statusMessage = statusMessages[status] || {
            title: 'Status Updated',
            message: `Your booking #${updatedBooking.bookingNumber} status has been updated to ${status}`
          }

          let notificationRouteObj: any = undefined;

          if (orderType === 'AUTO_PARTS') {
            notificationRouteObj = {
              actionType: 'navigate',
              screen: 'PartRequestOffers',
              params: [
                {
                name: 'requestId',
                value: updatedOrder?.partRequest?.id,
                },
                {
                name: 'request',
                value: updatedOrder?.partRequest,
                },
              ]
            }
            
          } else {
            notificationRouteObj = {
              actionType: 'navigate',
              screen: 'CourierBookingScreen',
              params: [{ name: 'bookingId', value: courierBookingId }],
            }
          }

          await NotificationBridge.sendNotification({
            userId: updatedBooking.customer.id,
            title: statusMessage.title,
            message: statusMessage.message,
            type: 'ORDER_UPDATE',
            module: 'COURIER',
            actionUrl: `/courier-bookings/${courierBookingId}`,
            data: {
              ...notificationRouteObj,
              
            }
          })
        }
      } catch (notifyError) {
        console.error('Failed to send status notification to customer:', notifyError)
      }
    }

    // Send notification to rider if assigned
    if (updatedBooking.rider && status !== 'REQUESTED' && status !== 'BIDDING') {
      try {
        const riderStatusMessages: {[key: string]: {title: string, message: string}} = {
          'EN_ROUTE_TO_PICKUP': {
            title: 'Status Updated',
            message: `You are en route to pickup for booking #${updatedBooking.bookingNumber}`
          },
          'ARRIVED_AT_PICKUP': {
            title: 'Arrived at Pickup',
            message: `You have arrived at pickup location for booking #${updatedBooking.bookingNumber}`
          },
          'PICKED_UP': {
            title: 'Package Picked Up',
            message: `Package picked up successfully for booking #${updatedBooking.bookingNumber}`
          },
          'EN_ROUTE_TO_DROPOFF': {
            title: 'En Route to Dropoff',
            message: `You are en route to dropoff location for booking #${updatedBooking.bookingNumber}`
          },
          'ARRIVED_AT_DROPOFF': {
            title: 'Arrived at Dropoff',
            message: `You have arrived at dropoff location for booking #${updatedBooking.bookingNumber}`
          },
          'DELIVERED': {
            title: 'Delivery Completed',
            message: `Delivery completed successfully for booking #${updatedBooking.bookingNumber}`
          }
        }

        const riderMessage = riderStatusMessages[status] || {
          title: 'Status Updated',
          message: `Booking #${updatedBooking.bookingNumber} status updated to ${status}`
        }

        await NotificationBridge.sendNotification({
          userId: updatedBooking.rider.id,
          title: riderMessage.title,
          message: riderMessage.message,
          type: 'ORDER_UPDATE',
          module: 'COURIER',
          actionUrl: `/rider/live-map/${courierBookingId}`,
          data: {
            actionType: 'navigate',
            screen: 'RiderLiveMapScreen',
            params: {
              name: 'booking',
              value: courierBookingId,
            }
          }
        })
      } catch (notifyError) {
        console.error('Failed to send status notification to rider:', notifyError)
      }
    }

    const rideType = await prisma.rideType.findUnique({
      where: { id: updatedBooking.rideTypeId },
    })

    // Send email to customer about status update
    if (updatedBooking.customer.email) {
      await sendEmailFromTemplate(updatedBooking.customer.email!, 'RIDE_FEEDBACK_REQUEST', {
      customerName: updatedBooking.customer.name,
      riderName: updatedBooking.rider?.name,
      rideType: rideType?.name || '',
      rideId: updatedBooking.id,
      feedbackUrl: `${process.env.APP_URL}/ride-feedback/${updatedBooking.id}`,
      appName: process.env.APP_NAME || 'Killo',
    })
    }

    return NextResponse.json({
      success: true,
      message: "Status updated successfully",
      data: {
        id: updatedBooking.id,
        status: updatedBooking.status,
        updatedAt: updatedBooking.updatedAt,
      }
    })

  } catch (error) {
    console.error("Error updating courier booking status:", error)
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 })
  }
}
