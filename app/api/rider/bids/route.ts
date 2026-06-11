import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { rejectIfRiderCommissionLocked } from '@/lib/rider-app-access'

// GET /api/rider/bids - Get all bids for the authenticated rider
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || user.role !== 'RIDER') {
      return NextResponse.json(
        { error: 'Unauthorized - Rider access required' },
        { status: 401 }
      )
    }

    const riderLockResponse = rejectIfRiderCommissionLocked(user)
    if (riderLockResponse) return riderLockResponse

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // PENDING, ACCEPTED, REJECTED, EXPIRED, WITHDRAWN
    const type = searchParams.get('type') // ride, courier, all

    // Build where clause for bids
    const bidWhere: any = {
      riderId: user.id,
    }

    if (status && status !== 'all') {
      bidWhere.status = status.toUpperCase()
    }

    // Fetch ride bids
    const rideBids = await prisma.rideBid.findMany({
      where: type === 'courier' ? { id: 'none' } : bidWhere, // Only fetch if not courier-only
      include: {
        rideBooking: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                avatar: true,
              },
            },
            rideType: {
              select: {
                id: true,
                name: true,
                basePrice: true,
                pricePerKm: true,
                pricePerMinute: true,
                icon: true,
                description: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Fetch courier bids
    const courierBids = await prisma.courierBid.findMany({
      where: type === 'ride' ? { id: 'none' } : bidWhere, // Only fetch if not ride-only
      include: {
        courierBooking: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                avatar: true,
              },
            },
            rideType: {
              select: {
                id: true,
                name: true,
                basePrice: true,
                pricePerKm: true,
                pricePerMinute: true,
                icon: true,
                description: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Transform ride bids
    const transformedRideBids = rideBids.map(bid => ({
      id: bid.id,
      type: 'ride' as const,
      bidAmount: bid.bidAmount,
      estimatedTime: bid.estimatedTime,
      message: bid.message,
      status: bid.status,
      expiresAt: bid.expiresAt,
      createdAt: bid.createdAt,
      booking: {
        id: bid.rideBooking.id,
        bookingNumber: bid.rideBooking.bookingNumber,
        status: bid.rideBooking.status,
        pickupAddress: bid.rideBooking.pickupAddress,
        pickupLatitude: bid.rideBooking.pickupLatitude,
        pickupLongitude: bid.rideBooking.pickupLongitude,
        pickupLandmark: bid.rideBooking.pickupLandmark,
        dropAddress: bid.rideBooking.dropAddress,
        dropLatitude: bid.rideBooking.dropLatitude,
        dropLongitude: bid.rideBooking.dropLongitude,
        dropLandmark: bid.rideBooking.dropLandmark,
        distance: bid.rideBooking.distance,
        estimatedTime: bid.rideBooking.estimatedTime,
        estimatedFare: bid.rideBooking.estimatedFare,
        finalFare: bid.rideBooking.finalFare,
        passengerCount: bid.rideBooking.passengerCount,
        passengerPhone: bid.rideBooking.passengerPhone,
        specialRequests: bid.rideBooking.specialRequests,
        scheduledAt: bid.rideBooking.scheduledAt,
        createdAt: bid.rideBooking.createdAt,
        customer: bid.rideBooking.customer,
        rideType: bid.rideBooking.rideType,
        // Check if booking is already assigned to another rider
        isBookedByAnother: bid.rideBooking.riderId && bid.rideBooking.riderId !== user.id,
        assignedRiderId: bid.rideBooking.riderId,
      },
    }))

    // Transform courier bids
    const transformedCourierBids = courierBids.map(bid => ({
      id: bid.id,
      type: 'courier' as const,
      bidAmount: bid.bidAmount,
      estimatedTime: bid.estimatedTime,
      message: bid.message,
      status: bid.status,
      expiresAt: bid.expiresAt,
      createdAt: bid.createdAt,
      booking: {
        id: bid.courierBooking.id,
        bookingNumber: bid.courierBooking.bookingNumber,
        status: bid.courierBooking.status,
        pickupAddress: bid.courierBooking.pickupAddress,
        pickupLatitude: bid.courierBooking.pickupLatitude,
        pickupLongitude: bid.courierBooking.pickupLongitude,
        dropAddress: bid.courierBooking.dropAddress,
        dropLatitude: bid.courierBooking.dropLatitude,
        dropLongitude: bid.courierBooking.dropLongitude,
        distance: bid.courierBooking.distance,
        estimatedTime: bid.courierBooking.estimatedTime,
        fare: bid.courierBooking.fare,
        notes: bid.courierBooking.notes,
        recipientName: bid.courierBooking.recipientName,
        recipientPhone: bid.courierBooking.recipientPhone,
        packageType: bid.courierBooking.packageType,
        packageWeight: bid.courierBooking.packageWeight,
        isFragile: bid.courierBooking.isFragile,
        scheduledAt: bid.courierBooking.scheduledAt,
        createdAt: bid.courierBooking.createdAt,
        customer: bid.courierBooking.customer,
        rideType: bid.courierBooking.rideType,
        // Check if booking is already assigned to another rider
        isBookedByAnother: bid.courierBooking.riderId && bid.courierBooking.riderId !== user.id,
        assignedRiderId: bid.courierBooking.riderId,
      },
    }))

    // Combine and sort all bids
    const allBids = [...transformedRideBids, ...transformedCourierBids]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Get statistics
    const stats = {
      total: allBids.length,
      pending: allBids.filter(bid => bid.status === 'PENDING').length,
      accepted: allBids.filter(bid => bid.status === 'ACCEPTED').length,
      rejected: allBids.filter(bid => bid.status === 'REJECTED').length,
      expired: allBids.filter(bid => bid.status === 'EXPIRED').length,
      withdrawn: allBids.filter(bid => bid.status === 'WITHDRAWN').length,
      bookedByAnother: allBids.filter(bid => bid.booking.isBookedByAnother).length,
    }

    return NextResponse.json({
      success: true,
      data: allBids,
      stats,
    })
  } catch (error) {
    console.error('Error fetching rider bids:', error)
    return NextResponse.json(
      { error: 'Failed to fetch bids' },
      { status: 500 }
    )
  }
}
