import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

// PUT /api/rider/bid/ride-booking/[id]/withdraw - Withdraw a ride bid
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || user.role !== 'RIDER') {
      return NextResponse.json(
        { error: 'Unauthorized - Rider access required' },
        { status: 401 }
      )
    }

    const bookingId = params.id

    // Find the bid for this rider and booking
    const bid = await prisma.rideBid.findFirst({
      where: {
        rideBookingId: bookingId,
        riderId: user.id,
        status: 'PENDING', // Only allow withdrawal of pending bids
      },
      include: {
        rideBooking: true,
      },
    })

    if (!bid) {
      return NextResponse.json(
        { error: 'Bid not found or already processed' },
        { status: 404 }
      )
    }

    // Update bid status to WITHDRAWN
    const updatedBid = await prisma.rideBid.update({
      where: {
        id: bid.id,
      },
      data: {
        status: 'WITHDRAWN',
      },
      include: {
        rideBooking: {
          include: {
            customer: true,
          },
        },
      },
    })

    // TODO: Send WebSocket notification to customer about bid withdrawal
    // You can implement this using your WebSocket service

    return NextResponse.json({
      success: true,
      data: updatedBid,
      message: 'Bid withdrawn successfully',
    })
  } catch (error) {
    console.error('Error withdrawing ride bid:', error)
    return NextResponse.json(
      { error: 'Failed to withdraw bid' },
      { status: 500 }
    )
  }
}


