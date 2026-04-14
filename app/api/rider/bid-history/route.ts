import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

// GET /api/rider/bid-history - Get recent bid history for dashboard
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || user.role !== 'RIDER') {
      return NextResponse.json(
        { error: 'Unauthorized - Rider access required' },
        { status: 401 }
      )
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '5')
    const type = searchParams.get('type') // ride, courier, all

    // Build where clause for bids
    const bidWhere: any = {
      riderId: user.id,
    }

    if (type && type !== 'all') {
      // We'll filter by type after fetching
    }

    // Fetch recent ride bids
    const rideBids = await prisma.rideBid.findMany({
      where: type === 'courier' ? { id: 'none' } : bidWhere,
      include: {
        rideBooking: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
                avatar: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: type === 'courier' ? 0 : limit,
    })

    // Fetch recent courier bids
    const courierBids = await prisma.courierBid.findMany({
      where: type === 'ride' ? { id: 'none' } : bidWhere,
      include: {
        courierBooking: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
                avatar: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: type === 'ride' ? 0 : limit,
    })

    // Transform ride bids
    const transformedRideBids = rideBids.map(bid => ({
      id: bid.id,
      type: 'ride' as const,
      bidAmount: bid.bidAmount,
      estimatedTime: bid.estimatedTime,
      status: bid.status,
      createdAt: bid.createdAt,
      booking: {
        id: bid.rideBooking.id,
        bookingNumber: bid.rideBooking.bookingNumber,
        status: bid.rideBooking.status,
        dropAddress: bid.rideBooking.dropAddress,
        distance: bid.rideBooking.distance,
        estimatedFare: bid.rideBooking.estimatedFare,
        finalFare: bid.rideBooking.finalFare,
        customer: bid.rideBooking.customer,
        isBookedByAnother: bid.rideBooking.riderId && bid.rideBooking.riderId !== user.id,
      },
    }))

    // Transform courier bids
    const transformedCourierBids = courierBids.map(bid => ({
      id: bid.id,
      type: 'courier' as const,
      bidAmount: bid.bidAmount,
      estimatedTime: bid.estimatedTime,
      status: bid.status,
      createdAt: bid.createdAt,
      booking: {
        id: bid.courierBooking.id,
        bookingNumber: bid.courierBooking.bookingNumber,
        status: bid.courierBooking.status,
        dropAddress: bid.courierBooking.dropAddress,
        distance: bid.courierBooking.distance,
        fare: bid.courierBooking.fare,
        customer: bid.courierBooking.customer,
        isBookedByAnother: bid.courierBooking.riderId && bid.courierBooking.riderId !== user.id,
      },
    }))

    // Combine and sort all bids
    const allBids = [...transformedRideBids, ...transformedCourierBids]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)

    return NextResponse.json({
      success: true,
      data: allBids,
    })
  } catch (error) {
    console.error('Error fetching bid history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch bid history' },
      { status: 500 }
    )
  }
}

