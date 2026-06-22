import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth"
import { computeRiderPickupEta } from "@/lib/riding-bid-pickup-eta"
import { getRidingBiddingPolicy } from "@/lib/riding-bid-expiry"

export async function GET(
  request: NextRequest
) {
  try {
    // Get authorization header
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authorization header missing or invalid" },
        { status: 401 }
      );
    }

    // Get bookingId from query parameters
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('bookingId');

    if (!bookingId) {
      return NextResponse.json(
        { success: false, error: "Booking ID is required" },
        { status: 400 }
      );
    }

    // First, check if this is a ride booking or courier booking
    const rideBooking = await prisma.rideBooking.findUnique({
      where: { id: bookingId },
      select: { 
        id: true, 
        customerId: true, 
        status: true,
        bookingNumber: true,
        pickupLatitude: true,
        pickupLongitude: true,
      }
    });

    const courierBooking = await prisma.courierBooking.findUnique({
      where: { id: bookingId },
      select: { 
        id: true, 
        customerId: true, 
        status: true,
        bookingNumber: true,
        pickupLatitude: true,
        pickupLongitude: true,
      }
    });

    // Determine which booking type this is
    const booking = rideBooking || courierBooking;
    const bookingType = rideBooking ? 'ride' : 'courier';

    if (!booking) {
      return NextResponse.json(
        { success: false, error: "Booking not found" },
        { status: 404 }
      );
    }

    // Check if the user is the customer who made this booking
    if (booking.customerId !== user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized to view this booking" },
        { status: 403 }
      );
    }

    if (bookingType === "ride") {
      const { expirePendingRideBidsForBooking } = await import("@/lib/riding-bid-expiry")
      await expirePendingRideBidsForBooking(bookingId)
    } else {
      const { expirePendingCourierBidsForBooking } = await import("@/lib/riding-bid-expiry")
      await expirePendingCourierBidsForBooking(bookingId)
    }

    const pickupLat = Number((booking as any).pickupLatitude)
    const pickupLng = Number((booking as any).pickupLongitude)
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || null

    // Fetch bids based on booking type
    let transformedBids: any[] = [];
    
    if (bookingType === 'ride') {
      const rideBids = await prisma.rideBid.findMany({
        where: {
          rideBookingId: bookingId,
          status: 'PENDING'
        },
        include: {
          rider: {
            select: {
              id: true,
              name: true,
              phone: true,
              avatar: true,
              riderProfile: {
                select: {
                  vehicleType: true,
                  licensePlate: true,
                  rating: true,
                  currentLocation: true,
                }
              }
            }
          }
        },
        orderBy: {
          bidAmount: 'asc'
        }
      });

      transformedBids = await Promise.all(
        rideBids.map(async (bid) => {
          const pickupEta = await computeRiderPickupEta({
            riderLocation: bid.rider.riderProfile?.currentLocation,
            pickupLat,
            pickupLng,
            googleApiKey,
          })
          return {
            id: bid.id,
            bidAmount: bid.bidAmount,
            estimatedTime: bid.estimatedTime,
            pickupEtaMinutes: pickupEta.pickupEtaMinutes,
            pickupDistanceKm: pickupEta.pickupDistanceKm,
            message: bid.message,
            status: bid.status,
            createdAt: bid.createdAt,
            expiresAt: bid.expiresAt,
            rider: {
              id: bid.rider.id,
              name: bid.rider.name,
              phone: bid.rider.phone,
              avatar: bid.rider.avatar,
              vehicleType: bid.rider.riderProfile?.vehicleType,
              licensePlate: bid.rider.riderProfile?.licensePlate,
              rating: bid.rider.riderProfile?.rating || 0
            }
          }
        }),
      );
    } else {
      const courierBids = await prisma.courierBid.findMany({
        where: {
          courierBookingId: bookingId,
          status: 'PENDING'
        },
        include: {
          
          rider: {
            select: {
              id: true,
              name: true,
              phone: true,
              avatar: true,
              
              riderProfile: {
                select: {
                  vehicleType: true,
                  licensePlate: true,
                  rating: true,
                  currentLocation: true,
                }
              }
            }
          }
        },
        orderBy: {
          bidAmount: 'asc'
        }
      });

      transformedBids = await Promise.all(
        courierBids.map(async (bid) => {
          const pickupEta = await computeRiderPickupEta({
            riderLocation: bid.rider.riderProfile?.currentLocation,
            pickupLat,
            pickupLng,
            googleApiKey,
          })
          return {
            id: bid.id,
            bidAmount: bid.bidAmount,
            estimatedTime: bid.estimatedTime,
            pickupEtaMinutes: pickupEta.pickupEtaMinutes,
            pickupDistanceKm: pickupEta.pickupDistanceKm,
            message: bid.message,
            status: bid.status,
            createdAt: bid.createdAt,
            expiresAt: bid.expiresAt,
            rider: {
              id: bid.rider.id,
              name: bid.rider.name,
              phone: bid.rider.phone,
              avatar: bid.rider.avatar,
              vehicleType: bid.rider.riderProfile?.vehicleType,
              licensePlate: bid.rider.riderProfile?.licensePlate,
              rating: bid.rider.riderProfile?.rating || 0
            }
          }
        }),
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        bookingId,
        bookingType,
        bookingStatus: booking.status,
        bookingNumber: booking.bookingNumber,
        bids: transformedBids,
        totalBids: transformedBids.length,
        biddingPolicy: getRidingBiddingPolicy(),
      }
    });

  } catch (error) {
    console.error("Error fetching bids:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
