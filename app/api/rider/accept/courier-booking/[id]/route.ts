import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { socketIOServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"
import { createRiderEarning } from "@/lib/rider-earnings-helper"

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest(request)

    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = params
    const riderId = session.id

    if (!riderId) {
      return NextResponse.json(
        { error: "Rider ID is required" },
        { status: 400 }
      )
    }

    console.log("🔑 Rider ID:", riderId)

    // Check if the courier booking exists and is available
    const courierBooking = await prisma.courierBooking.findUnique({
      where: { id },
      include: {
        customer: true,
        supplierOrders: {
          include: {
            pharmacy: {
              select: {
                id: true,
                pharmacyName: true,
                userId: true,
                phone: true,
              }
            },
            wholesaler: {
              select: {
                id: true,
                companyName: true,
                userId: true,
              }
            }
          }
        }
      },
    })

    console.log("🔑 Courier Booking:", courierBooking)

    if (!courierBooking) {
      return NextResponse.json(
        { error: "Courier booking not found" },
        { status: 404 }
      )
    }

    // Check if this is a WHOLESALER module booking (supplier order)
    const isSupplierOrder = courierBooking.module === 'WHOLESALER'
    
    // Fetch order or supplier order based on module
    let checkOrderId: any = null
    let supplierOrder: any = null
    
    if (isSupplierOrder) {
      // For WHOLESALER module, fetch supplier order
      if (courierBooking.supplierOrders && courierBooking.supplierOrders.length > 0) {
        supplierOrder = courierBooking.supplierOrders[0]
      } else {
        return NextResponse.json(
          { error: "Supplier order not found for this courier booking" },
          { status: 404 }
        )
      }
    } else {
      // For other modules, fetch regular order (only if orderId exists)
      if (courierBooking.orderId) {
        checkOrderId = await prisma.order.findUnique({
          where: { id: courierBooking.orderId },
          include: {
            customer: true,
            partRequest: true,  
          },
        })
      }
    }

    
    if (courierBooking.status !== "REQUESTED" && courierBooking.status !== "BIDDING" && courierBooking.status !== "ACCEPTED") {
      return NextResponse.json(
        { error: "Courier booking is not available for acceptance" },
        { status: 400 }
      )
    }

    

    // Check if rider is available
    const rider = await prisma.riderProfile.findUnique({
      where: { userId: riderId },
      include: {
        user: true,
      },
    })
    

    if (!rider) {
      return NextResponse.json(
        { error: "Rider not found" },
        { status: 404 }
      )
    }
   

    // if (!rider.isAvailable) {
    //   return NextResponse.json(
    //     { error: "Rider is not available" },
    //     { status: 400 }
    //   )
    // }

    const lockResult = await prisma.courierBooking.updateMany({
      where: {
        id,
        status: { in: ["REQUESTED", "BIDDING", "RIDER_ASSIGNED"] as any },
        OR: [{ riderId: null }, { riderId }],
      },
      data: {
        status: "RIDER_ASSIGNED",
        riderId: riderId,
        updatedAt: new Date(),
      },
    })
    if (lockResult.count === 0) {
      return NextResponse.json({ error: "Request already assigned to another rider" }, { status: 409 })
    }
    const updatedBooking = await prisma.courierBooking.findUnique({
      where: { id },
      include: {
        customer: true,
        bids: { include: { rider: true } },
      },
    })
    if (!updatedBooking) {
      return NextResponse.json({ error: "Booking not found after assignment" }, { status: 404 })
    }
    await prisma.courierBid.updateMany({
      where: { courierBookingId: id, status: "PENDING", riderId: { not: riderId } },
      data: { status: "REJECTED" },
    })

    // Get promo code info from booking if applied
    let promoCodeDiscount = 0
    let promoCodeId: string | undefined = undefined
    try {
      const promoUsage = await prisma.promoCodeUsage.findFirst({
        where: {
          courierBookingId: id,
        },
        include: {
          promoCode: true,
        },
      })

      if (promoUsage) {
        promoCodeDiscount = promoUsage.discount
        promoCodeId = promoUsage.promoCodeId
        console.log("🎟️ Promo code found:", { promoCodeId, discount: promoCodeDiscount })
      }
    } catch (promoError) {
      console.error("Error fetching promo code usage:", promoError)
      // Continue without promo code if fetch fails
    }

    // Create rider earning entry with commission calculation
    try {
      // IMPORTANT: For courier bookings, there's only `fare` field which stores the FINAL amount (after discount)
      // To get the ORIGINAL amount, we need to add the promo discount back to the fare
      // If there's no promo code, then fare IS the original amount
      const finalAmount = updatedBooking.fare || 0
      let originalAmount = finalAmount
      
      // If there's a promo code discount, calculate the original amount by adding the discount back
      if (promoCodeDiscount > 0) {
        originalAmount = finalAmount + promoCodeDiscount
        console.log("⚠️ Courier booking: Calculating original amount from fare + discount:", originalAmount)
      }
      
      // Fallback: if originalAmount is 0 or invalid and there's a promo code, ensure we calculate it
      if (originalAmount <= 0 && promoCodeDiscount > 0) {
        originalAmount = finalAmount + promoCodeDiscount
        console.log("⚠️ Invalid fare, calculating original from finalAmount + discount:", originalAmount)
      }
      
      // Additional validation: if fare seems too low compared to discount, recalculate
      if (promoCodeDiscount > 0 && finalAmount < promoCodeDiscount) {
        originalAmount = finalAmount + promoCodeDiscount
        console.log("⚠️ Fare is less than discount, recalculating original:", originalAmount)
      }
      
  
      
      if (originalAmount > 0) {
        await createRiderEarning({
          riderId: riderId,
          courierBookingId: id,
          orderId: updatedBooking.orderId || undefined,
          totalAmount: originalAmount, // Original amount before discount (calculated)
          finalAmount: finalAmount, // Final amount after discount (fare)
          description: `Earning from courier booking #${updatedBooking.bookingNumber}`,
          promoCodeDiscount: promoCodeDiscount,
          promoCodeId: promoCodeId,
        })
      } else {
        console.error("❌ Invalid originalAmount:", originalAmount)
      }
    } catch (earningError) {
      console.error("❌ Error creating rider earning:", earningError)
      // Don't fail the request if earning creation fails, but log it
    }

    // Update rider availability
    await prisma.riderProfile.update({
      where: { userId: riderId },
      data: {
        isAvailable: false,
        updatedAt: new Date(),
      },
    })

    // Send WebSocket notification to all riders who have bids on this booking
    if (updatedBooking.bids && updatedBooking.bids.length > 0) {
      const bidUpdateMessage = {
        type: 'booking_status_update',
        payload: {
          bookingId: updatedBooking.id,
          bookingType: 'courier',
          status: updatedBooking.status,
          bookingNumber: updatedBooking.bookingNumber,
          isBookedByAnother: true,
          assignedRiderId: updatedBooking.riderId
        }
      }

      // Send to all riders who have bids on this booking
      for (const bid of updatedBooking.bids) {
        if (bid.rider && bid.rider.id !== riderId) {
          await socketIOServer.sendNotificationToUser(bid.rider.id, bidUpdateMessage.payload)
          await socketIOServer.sendNotificationToUser(bid.rider.id, {
            type: "request_removed",
            requestId: updatedBooking.id,
            reason: "RIDER_ASSIGNED",
          })
        }
      }
    }


    // Send notification using NotificationBridge
    try {
      // For supplier orders, notify the pharmacy (customer)
      // For regular orders, notify the regular customer
      const customerUserId = isSupplierOrder && supplierOrder?.pharmacy?.userId 
        ? supplierOrder.pharmacy.userId 
        : courierBooking.customerId
      
      const notificationMessage = isSupplierOrder
        ? `A rider has accepted your supplier order delivery #${courierBooking.bookingNumber}. You can now track your delivery in real-time.`
        : `A rider has accepted your courier request #${courierBooking.bookingNumber}. You can now track your delivery in real-time.`
      
      const actionUrl = isSupplierOrder
        ? `/pharmacy/orders/${supplierOrder?.id}`
        : `/courier-bookings/${id}`
      
      await NotificationBridge.sendNotification({
        userId: customerUserId,
        title: "Rider Assigned!",
        message: notificationMessage,
        type: "ORDER_UPDATE",
        module: isSupplierOrder ? "PHARMACY" : "COURIER",
        actionUrl: actionUrl,
        data: {
          bookingId: id,
          riderId: riderId,
          riderName: rider.user?.name,
          status: 'RIDER_ASSIGNED',
          bookingType: 'courier',
          ...(isSupplierOrder && supplierOrder ? { supplierOrderId: supplierOrder.id } : {})
        }
      })
    } catch (notifyError) {
      console.error('Failed to send customer notification:', notifyError)
    }

    // Send auto message to customer when rider accepts
    try {
      const autoText = `Hello ${updatedBooking.customer?.name || "there"}, I have accepted your request and I am on my way.`
      const autoMessage = await prisma.rideMessage.create({
        data: {
          courierBookingId: id,
          senderId: riderId,
          message: autoText,
          messageType: 'TEXT',
        },
      })
      await socketIOServer.sendNotificationToUser(updatedBooking.customerId, {
        type: 'chat_message',
        chatId: id,
        bookingId: id,
        id: autoMessage.id,
        senderId: riderId,
        senderName: rider.user?.name || 'Rider',
        senderRole: 'RIDER',
        message: autoText,
        messageType: 'TEXT',
        timestamp: autoMessage.createdAt.toISOString(),
      })
    } catch (msgError) {
      console.error('Failed to send auto message:', msgError)
      // Don't fail the request if message creation fails
    }

    // Send notification to rider
    try {
      let notificationRouteObj: any = undefined
      
      if (isSupplierOrder && supplierOrder) {
        // For supplier orders, navigate to supplier order tracking
        notificationRouteObj = {
          actionType: "navigate",
          screen: 'RiderLiveMap',
          params: [
            { name: 'booking', value: { 
              ...updatedBooking,
              type: 'courier',
            }},
          ],
        }
      } else if (checkOrderId?.partRequest?.id) {
        // For auto parts orders with part request
        notificationRouteObj = {
          actionType: "navigate",
          screen: 'PartRequestOffers',
          params: [
            { name: 'requestId', value: checkOrderId?.partRequest?.id },
          ],
        }
      } else {
        // Default courier booking navigation
        notificationRouteObj = {
          actionType: "navigate",
          screen: 'CourierBooking',
          params: [
            { name: 'id', value: id },
          ],
        }
      }
      
      const notificationModule = isSupplierOrder ? "PHARMACY" : "COURIER"
      const notificationMessage = isSupplierOrder
        ? `You have accepted supplier order delivery #${courierBooking.bookingNumber}. Start heading to the pickup location.`
        : `You have accepted courier booking #${courierBooking.bookingNumber}. Start heading to the pickup location.`
      
      await NotificationBridge.sendNotification({
        userId: riderId,
        title: "Booking Accepted",
        message: notificationMessage,
        type: "ORDER_UPDATE",
        module: notificationModule,
        actionUrl: `/rider/booking/${id}`,
        data: {
          ...notificationRouteObj,
        }
      })
    } catch (notifyError) {
      console.error('Failed to send rider notification:', notifyError)
    }

    return NextResponse.json({
      success: true,
      message: "Courier booking accepted successfully",
      booking: updatedBooking,
    })

  } catch (error) {
    console.error("Error accepting courier booking:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to accept courier booking",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
