import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from '@/lib/auth'
import { rejectIfRiderCommissionLocked } from '@/lib/rider-app-access'
import { createRiderEarning } from "@/lib/rider-earnings-helper"
import { socketIOServer } from "@/lib/socket-server"

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest(request)

    if (session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const riderLockResponse = rejectIfRiderCommissionLocked(session)
    if (riderLockResponse) return riderLockResponse

    const { id } = params
    const body = await request.json()
    const riderId = session.id

    if (!riderId) {
      return NextResponse.json(
        { error: "Rider ID is required" },
        { status: 400 }
      )
    }

    // Check if the ride booking exists and is available
    const rideBooking = await prisma.rideBooking.findUnique({
      where: { id },
      include: {
        customer: true,
      },
    })

    if (!rideBooking) {
      return NextResponse.json(
        { error: "Ride booking not found" },
        { status: 404 }
      )
    }

    if (rideBooking.status !== "REQUESTED" && rideBooking.status !== "BIDDING") {
      return NextResponse.json(
        { error: "Ride booking is not available for acceptance" },
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

    if (!rider.isAvailable) {
      return NextResponse.json(
        { error: "Rider is not available" },
        { status: 400 }
      )
    }

    const lockResult = await prisma.rideBooking.updateMany({
      where: {
        id,
        status: { in: ["REQUESTED", "BIDDING", "ACCEPTED"] as any },
        OR: [{ riderId: null }, { riderId: riderId }],
      },
      data: {
        status: "ACCEPTED",
        riderId: riderId,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    if (lockResult.count === 0) {
      return NextResponse.json({ error: "Ride already assigned to another rider" }, { status: 409 })
    }
    const updatedBooking = await prisma.rideBooking.findUnique({
      where: { id },
      include: { customer: true, rider: true, rideType: true, rideBids: true },
    })
    if (!updatedBooking) {
      return NextResponse.json({ error: "Ride booking not found after assignment" }, { status: 404 })
    }
    await prisma.rideBid.updateMany({
      where: { rideBookingId: id, status: "PENDING", riderId: { not: riderId } },
      data: { status: "REJECTED" },
    })

    // Get promo code info from booking if applied
    let promoCodeDiscount = 0
    let promoCodeId: string | undefined = undefined
    try {
      const promoUsage = await prisma.promoCodeUsage.findFirst({
        where: {
          rideBookingId: id,
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
      // IMPORTANT: estimatedFare should be the ORIGINAL amount (before discount)
      // finalFare is the FINAL amount (after discount)
      // However, if estimatedFare equals finalFare and there's a promo code, 
      // we need to calculate the original by adding the discount back
      const finalAmount = updatedBooking.finalFare || updatedBooking.estimatedFare || 0
      let originalAmount = updatedBooking.estimatedFare || 0
      
      // If there's a promo code discount and estimatedFare equals finalFare (or is missing),
      // calculate the original amount by adding the discount back
      if (promoCodeDiscount > 0 && originalAmount === finalAmount) {
        originalAmount = finalAmount + promoCodeDiscount
        console.log("⚠️ estimatedFare equals finalFare with promo code, calculating original:", originalAmount)
      }
      
      // Fallback: if originalAmount is 0 or invalid, use finalAmount + discount
      if (originalAmount <= 0 && promoCodeDiscount > 0) {
        originalAmount = finalAmount + promoCodeDiscount
        console.log("⚠️ Invalid estimatedFare, calculating from finalFare + discount:", originalAmount)
      }
      
      console.log("📊 Ride booking amounts:", {
        bookingId: id,
        estimatedFare: updatedBooking.estimatedFare,
        finalFare: updatedBooking.finalFare,
        promoCodeDiscount,
        calculatedOriginalAmount: originalAmount,
        finalAmount,
      })
      
      if (originalAmount > 0) {
        await createRiderEarning({
          riderId: riderId,
          rideBookingId: id,
          totalAmount: originalAmount, // Original amount before discount
          finalAmount: finalAmount, // Final amount after discount
          description: `Earning from ride booking #${updatedBooking.bookingNumber}`,
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

    // Create a notification for the customer
    await prisma.notification.create({
      data: {
        userId: rideBooking.customerId,
        title: "Ride Request Accepted",
        message: `Your ride request #${rideBooking.bookingNumber} has been accepted by a rider.`,
        type: "RIDE_ACCEPTED" as any,
        data: {
          bookingId: id,
          riderId: riderId,
          riderName: rider.user?.name,
        },
        createdAt: new Date(),
      },
    })

    // Send auto message to customer when rider accepts
    try {
      await prisma.rideMessage.create({
        data: {
          rideBookingId: id,
          senderId: riderId,
          senderName: rider.user?.name || 'Rider',
          senderRole: 'RIDER',
          message: "I'm on my way to pick you up! 🚗",
          messageType: 'TEXT',
          isRead: false,
        },
      })
    } catch (msgError) {
      console.error('Failed to send auto message:', msgError)
      // Don't fail the request if message creation fails
    }

    for (const bid of updatedBooking.rideBids || []) {
      if (!bid.riderId || bid.riderId === riderId) continue
      await socketIOServer.sendNotificationToUser(bid.riderId, {
        type: "request_removed",
        requestId: id,
        reason: "RIDER_ASSIGNED",
      })
    }

    try {
      await socketIOServer.sendNotificationToUser(rideBooking.customerId, {
        type: 'booking_status_update',
        bookingId: id,
        bookingType: 'ride',
        status: 'ACCEPTED',
        newStatus: 'ACCEPTED',
        bookingNumber: updatedBooking.bookingNumber,
        distance: updatedBooking.distance,
        estimatedTime: updatedBooking.estimatedTime,
        finalFare: updatedBooking.finalFare ?? updatedBooking.estimatedFare,
        estimatedFare: updatedBooking.estimatedFare,
        riderId: riderId,
        rider: {
          id: riderId,
          name: rider.user?.name,
          phone: rider.user?.phone,
          avatar: rider.user?.avatar,
          vehicleType: rider.vehicleType,
          licensePlate: rider.licensePlate,
        },
      })
    } catch (wsError) {
      console.error('Failed to send ride accept websocket to customer:', wsError)
    }

    return NextResponse.json({
      success: true,
      message: "Ride booking accepted successfully",
      booking: updatedBooking,
    })

  } catch (error) {
    console.error("Error accepting ride booking:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to accept ride booking",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
