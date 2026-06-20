import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { socketIOServer } from "@/lib/socket-server";

export async function POST(
  request: NextRequest,
  { params }: { params: { bidId: string } }
) {
  try {
    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { bidId } = params;
    if (!bidId) {
      return NextResponse.json({ success: false, error: "Bid ID is required" }, { status: 400 });
    }

    const rideBid = await prisma.rideBid.findUnique({
      where: { id: bidId },
      include: {
        rideBooking: { select: { id: true, customerId: true, bookingNumber: true } },
        rider: { select: { id: true } },
      },
    });

    const courierBid = rideBid
      ? null
      : await prisma.courierBid.findUnique({
          where: { id: bidId },
          include: {
            courierBooking: { select: { id: true, customerId: true, bookingNumber: true } },
            rider: { select: { id: true } },
          },
        });

    const bid = rideBid || courierBid;
    if (!bid) {
      return NextResponse.json({ success: false, error: "Bid not found" }, { status: 404 });
    }

    const booking = rideBid ? rideBid.rideBooking : courierBid!.courierBooking;
    const bookingType = rideBid ? "ride" : "courier";

    if (booking.customerId !== user.id) {
      return NextResponse.json({ success: false, error: "Not authorized to reject this bid" }, { status: 403 });
    }

    if (bid.status !== "PENDING") {
      return NextResponse.json({ success: false, error: "Bid is no longer pending" }, { status: 400 });
    }

    if (rideBid) {
      await prisma.rideBid.update({
        where: { id: bidId },
        data: { status: "REJECTED" },
      });
    } else {
      await prisma.courierBid.update({
        where: { id: bidId },
        data: { status: "REJECTED" },
      });
    }

    const riderId = bid.riderId;
    const bookingId = rideBid ? rideBid.rideBookingId : courierBid!.courierBookingId;

    try {
      await socketIOServer.sendNotificationToUser(riderId, {
        type: "bid_rejected",
        event: "bid_rejected",
        bidId,
        bookingId,
        bookingType,
        riderId,
        canBidAgain: true,
        bidStatus: "REJECTED",
        message: "Your offer was declined. You can submit a new bid.",
      });
    } catch (socketError) {
      console.error("Error sending bid rejected socket notification:", socketError);
    }

    try {
      await socketIOServer.sendNotificationToUser(riderId, {
        type: "bid_status_change",
        event: "bid_status_change",
        payload: {
          bidId,
          bookingId,
          bookingType,
          bookingNumber: booking.bookingNumber,
          status: "REJECTED",
          bidStatus: "REJECTED",
          canBidAgain: true,
          message: "Your bid has been declined by the customer",
        },
      });
    } catch (socketError) {
      console.error("Error sending bid status socket notification:", socketError);
    }

    return NextResponse.json({
      success: true,
      message: "Bid declined successfully",
      bid: { id: bidId, status: "REJECTED" },
    });
  } catch (error) {
    console.error("Error rejecting riding bid:", error);
    return NextResponse.json(
      { success: false, error: "Failed to decline bid" },
      { status: 500 }
    );
  }
}
