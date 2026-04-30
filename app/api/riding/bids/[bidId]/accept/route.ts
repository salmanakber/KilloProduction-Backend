import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { socketIOServer } from "@/lib/socket-server";
import { NotificationBridge } from "@/lib/notification-bridge";
import { createRiderEarning } from "@/lib/rider-earnings-helper";

export async function POST(
  request: NextRequest,
  { params }: { params: { bidId: string } }
) {
  try {
    // Get authorization header
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { bidId } = params;

    if (!bidId) {
      return NextResponse.json({ success: false, error: "Bid ID is required" }, { status: 400 })
    }

    // Find the bid and determine if it's a ride bid or courier bid
    const rideBid = await prisma.rideBid.findUnique({
      where: { id: bidId },
      include: {
        rideBooking: {
          select: {
            id: true,
            customerId: true,
            status: true,
            bookingNumber: true,
            pickupAddress: true,
            dropAddress: true,
            pickupLatitude: true,
            pickupLongitude: true,
            dropLatitude: true,
            dropLongitude: true,
            estimatedFare: true,
            distance: true,
            estimatedTime: true
          }
        },
        rider: {
          select: {
            id: true,
            name: true,
            phone: true,
            avatar: true
          }
        }
      }
    });

    const courierBid = await prisma.courierBid.findUnique({
      where: { id: bidId },
      include: {
        courierBooking: {
          select: {
            id: true,
            customerId: true,
            status: true,
            bookingNumber: true,
            pickupAddress: true,
            dropAddress: true,
            pickupLatitude: true,
            pickupLongitude: true,
            dropLatitude: true,
            dropLongitude: true,
            fare: true, // finalFare
            distance: true,
            estimatedTime: true
          }
        },
        rider: {
          select: {
            id: true,
            name: true,
            phone: true,
            avatar: true
          }
        }
      }
    });

    // Determine which bid type this is
    const bid = rideBid || courierBid;
    const booking = rideBid?.rideBooking || courierBid?.courierBooking;
    const bookingType = rideBid ? 'ride' : 'courier';
console.log('💰 Bid:', bid)
console.log('💰 Booking:', booking)
    if (!bid || !booking) {
      return NextResponse.json({ success: false, error: "Bid not found" }, { status: 404 })
    }

    // Check if the user is the customer who made this booking
    if (booking.customerId !== user.id) {
      return NextResponse.json({ success: false, error: "Unauthorized to accept this bid" }, { status: 403 })
    }

    // Check if the booking is still in BIDDING status
    if (booking.status !== 'BIDDING') {
      return NextResponse.json({ success: false, error: "Booking is no longer accepting bids" }, { status: 400 })
    }

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Update the bid status to ACCEPTED
      if (bookingType === 'ride') {
        await tx.rideBid.update({
          where: { id: bidId },
          data: { status: 'ACCEPTED' }
        });

        // Update the booking status and assign rider
        const updatedBooking = await tx.rideBooking.update({
          where: { id: booking.id },
          data: {
            status: 'ACCEPTED',
              riderId: bid.riderId,
            finalFare: bid.bidAmount
          }
        });

        // Reject all other pending bids for this booking
        await tx.rideBid.updateMany({
          where: {
            rideBookingId: booking.id,
            id: { not: bidId },
            status: 'PENDING'
          },
          data: { status: 'REJECTED' }
        });

        return { booking: updatedBooking, type: 'ride' };
      } else {
        await tx.courierBid.update({
          where: { id: bidId },
          data: { status: 'ACCEPTED' }
        });

        // Update the booking status and assign rider
        const updatedBooking = await tx.courierBooking.update({
          where: { id: booking.id },
          data: {
            status: 'ACCEPTED',
            riderId: bid.rider.id,
            fare: bid.bidAmount // finalFare
          }
        });

        // Reject all other pending bids for this booking
        await tx.courierBid.updateMany({
          where: {
            courierBookingId: booking.id,
            id: { not: bidId },
            status: 'PENDING'
          },
          data: { status: 'REJECTED' }
        });

        return { booking: updatedBooking, type: 'courier' };
      }
    });

    // Get promo code info from booking if applied
    let promoCodeDiscount = 0
    let promoCodeId: string | undefined = undefined
    try {
      const promoUsageWhere: any = {}
      if (bookingType === 'ride') {
        promoUsageWhere.rideBookingId = booking.id
      } else {
        promoUsageWhere.courierBookingId = booking.id
      }

      const promoUsage = await prisma.promoCodeUsage.findFirst({
        where: promoUsageWhere,
        include: {
          promoCode: true,
        },
      })

      if (promoUsage) {
        promoCodeDiscount = promoUsage.discount
        promoCodeId = promoUsage.promoCodeId
      }
    } catch (promoError) {
      console.error("Error fetching promo code usage:", promoError)
      // Continue without promo code if fetch fails
    }

    // Create rider earning entry with commission calculation
    try {
      const riderId = bookingType === 'ride' ? bid.riderId : bid.rider.id
      const finalAmount = bid.bidAmount
      
      // Calculate original amount:
      // For ride bookings: use estimatedFare if available, otherwise calculate from bidAmount + discount
      // For courier bookings: calculate from fare + discount (fare is the final/discounted amount)
      let originalAmount = 0
      
      if (bookingType === 'ride') {
        const estimatedFare = (booking as any).estimatedFare || 0
        // If there's a promo code and estimatedFare seems wrong (equals bidAmount), calculate it
        if (promoCodeDiscount > 0 && estimatedFare === finalAmount) {
          originalAmount = finalAmount + promoCodeDiscount
          console.log("⚠️ Bid acceptance: estimatedFare equals bidAmount with promo, calculating original:", originalAmount)
        } else {
          originalAmount = estimatedFare || (finalAmount + promoCodeDiscount)
        }
      } else {
        // Courier booking: fare is the final amount, calculate original by adding discount
        const fare = (booking as any).fare || 0
        originalAmount = promoCodeDiscount > 0 
          ? fare + promoCodeDiscount  // Add discount back to get original
          : fare  // No promo code, so fare is the original
      }
      
      console.log("📊 Bid acceptance amounts:", {
        bookingId: booking.id,
        bookingType,
        estimatedFare: bookingType === 'ride' ? (booking as any).estimatedFare : undefined,
        fare: bookingType === 'courier' ? (booking as any).fare : undefined,
        bidAmount: finalAmount,
        promoCodeDiscount,
        calculatedOriginalAmount: originalAmount,
        finalAmount,
      })
      
      if (originalAmount > 0) {
        await createRiderEarning({
          riderId: riderId,
          rideBookingId: bookingType === 'ride' ? booking.id : undefined,
          courierBookingId: bookingType === 'courier' ? booking.id : undefined,
          totalAmount: originalAmount, // Original amount before discount
          finalAmount: finalAmount, // Final amount after discount (bid amount)
          description: `Earning from ${bookingType} booking #${booking.bookingNumber} (bid accepted)`,
          promoCodeDiscount: promoCodeDiscount,
          promoCodeId: promoCodeId,
        })
      } else {
        console.error("❌ Invalid originalAmount for bid acceptance:", originalAmount)
      }
    } catch (earningError) {
      console.error("❌ Error creating rider earning from bid:", earningError)
      // Don't fail the request if earning creation fails
    }

    const updatedBooking = result.booking;
    // Send notification to rider using NotificationBridge
    try {
      await NotificationBridge.sendNotification({
        userId: bid.rider.id,
        title: 'Bid Accepted!',
        message: `Your bid for ${bookingType} booking #${booking.bookingNumber} has been accepted. The booking is now assigned to you.`,
        type: 'BID_ACCEPTED',
        module: bookingType === 'ride' ? 'RIDING' : 'COURIER',
        actionUrl: `/rider/booking/${booking.id}`,
        data: {
          bookingId: booking.id,
          bidId: bid.id,
          bidAmount: bid.bidAmount,
          estimatedTime: bid.estimatedTime,
          message: bid.message,
          bookingType: bookingType
        }
      })
    } catch (notifyError) {
      console.error('Failed to send bid acceptance notification:', notifyError)
    }

    // Send notification to customer
    try {
      await NotificationBridge.sendNotification({
        userId: booking.customerId,
        title: 'Rider Assigned',
        message: `A rider has been assigned to your ${bookingType} booking #${booking.bookingNumber}. You can now track your ${bookingType === 'ride' ? 'trip' : 'delivery'}.`,
        type: 'ORDER_UPDATE',
        module: bookingType === 'ride' ? 'RIDING' : 'COURIER',
        actionUrl: bookingType === 'ride' ? `/riding/bookings/${booking.id}` : `/courier-bookings/${booking.id}`,
        data: {
          bookingId: booking.id,
          riderId: bid.rider.id,
          status: 'ACCEPTED',
          bookingType: bookingType
        }
      })
    } catch (notifyError) {
      console.error('Failed to send customer notification:', notifyError)
    }

    // Get customer data for notification
    const customer = await prisma.user.findUnique({
      where: { id: booking.customerId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      }
    })

    // Notify the rider that their bid was accepted - send bid_accepted event for navigation
    await socketIOServer.sendNotificationToUser(bid.rider.id, {
      type: 'bid_accepted',
      event: 'bid_accepted',
      bidId: bidId,
      bookingId: booking.id,
      bookingType: bookingType,
      bookingNumber: booking.bookingNumber,
      status: 'ACCEPTED',
      bidStatus: 'ACCEPTED',
      customerId: booking.customerId,
      customerName: customer?.name,
      customerPhone: customer?.phone,
      customerEmail: customer?.email,
      pickupAddress: booking.pickupAddress,
      dropAddress: booking.dropAddress,
      pickupLatitude: booking.pickupLatitude,
      pickupLongitude: booking.pickupLongitude,
      dropLatitude: booking.dropLatitude,
      dropLongitude: booking.dropLongitude,
      finalFare: bid.bidAmount,
      fare: bid.bidAmount,
      estimatedFare: (booking as any).estimatedFare || bid.bidAmount,
      estimatedTime: booking.estimatedTime,
      distance: booking.distance,
      riderId: bid.rider.id,
      riderName: bid.rider.name,
      booking: {
        id: booking.id,
        type: bookingType,
        bookingNumber: booking.bookingNumber,
        status: 'ACCEPTED',
        pickupAddress: booking.pickupAddress,
        dropAddress: booking.dropAddress,
        pickupLatitude: booking.pickupLatitude,
        pickupLongitude: booking.pickupLongitude,
        dropLatitude: booking.dropLatitude,
        dropLongitude: booking.dropLongitude,
        distance: booking.distance,
        estimatedFare: (booking as any).estimatedFare || bid.bidAmount,
        finalFare: bid.bidAmount,
        fare: bid.bidAmount,
        estimatedTime: booking.estimatedTime,
        customer: {
          id: booking.customerId,
          name: customer?.name || 'Customer',
          phone: customer?.phone || '',
          email: customer?.email || '',
        },
      },
    });

    // Notify the customer about the successful acceptance
    await socketIOServer.sendNotificationToUser(booking.customerId, {
      type: 'bid_accepted',
      bidId: bidId,
      bookingId: booking.id,
      bookingType: bookingType,
      rider: {
        id: bid.rider.id,
        name: bid.rider.name,
        phone: bid.rider.phone,
        avatar: bid.rider.avatar
      },
      finalFare: bid.bidAmount
    });

    // Notify all riders that this request is no longer available
    await socketIOServer.sendNotificationToRole('RIDER', {
      type: 'request_status_change',
      requestId: booking.id,
      requestType: bookingType,
      newStatus: 'RIDER_ASSIGNED',
      bookingNumber: booking.bookingNumber
    });

    try {
      const autoText = `Hello ${customer?.name || "there"}, I'm on my way to your pickup point now. Please stay reachable.`
      const autoMessage = await prisma.rideMessage.create({
        data: {
          rideBookingId: booking.id,
          senderId: bid.rider.id,
          message: autoText,
          messageType: "TEXT",
        },
      })
      await socketIOServer.sendNotificationToUser(booking.customerId, {
        type: "chat_message",
        chatId: booking.id,
        bookingId: booking.id,
        id: autoMessage.id,
        senderId: bid.rider.id,
        senderName: bid.rider.name || "Rider",
        senderRole: "RIDER",
        message: autoText,
        messageType: "TEXT",
        timestamp: autoMessage.createdAt.toISOString(),
      })
    } catch (autoMsgError) {
      console.error("Failed to send ride auto acceptance message:", autoMsgError)
    }

    return NextResponse.json({
      success: true,
      data: {
        bidId: bidId,
        bookingId: booking.id,
        bookingType: bookingType,
        bookingStatus: 'RIDER_ASSIGNED',
        rider: {
          id: bid.rider.id,
          name: bid.rider.name,
          phone: bid.rider.phone,
          avatar: bid.rider.avatar
        },
        finalFare: bid.bidAmount,
        message: "Bid accepted successfully! Your rider has been notified."
      }
    });

  } catch (error) {
    console.error("Error accepting bid:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
