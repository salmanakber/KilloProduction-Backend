import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { NotificationBridge } from '@/lib/notification-bridge'
import {sendEmailFromTemplate } from '@/lib/email'

export async function GET(
  request: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session || session.role !== 'CUSTOMER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const bookingId = params.bookingId

    // Find the booking to get riderId
    let booking = await prisma.rideBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        customerId: true,
        riderId: true,
        status: true,
        customerRating: true,
        customerReview: true,
      },
    })

    let isCourierBooking = false
    if (!booking) {
      const courierBooking = await prisma.courierBooking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          customerId: true,
          riderId: true,
          status: true,
          customerRating: true,
          customerReview: true,
        } as any,
      })
      if (courierBooking) {
        booking = courierBooking as any
        isCourierBooking = true
      }
    }

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    // Verify the customer owns this booking
    if (booking.customerId !== session.id) {
      return NextResponse.json(
        { error: 'Unauthorized to view this booking review' },
        { status: 403 }
      )
    }

    if (!booking.riderId) {
      return NextResponse.json({
        success: true,
        hasReview: false,
        review: null,
      })
    }

    // Get rider profile to find riderProfile.id
    const riderProfile = await prisma.riderProfile.findUnique({
      where: { userId: booking.riderId },
      select: { id: true },
    })

    if (!riderProfile) {
      return NextResponse.json({
        success: true,
        hasReview: false,
        review: null,
      })
    }

    // Find existing review
    const existingReview = await prisma.review.findFirst({
      where: {
        userId: session.id,
        targetId: booking.riderId,
        targetType: 'RIDER',
        bookingID: bookingId, // Match by bookingId stored in orderId field
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    })

    
    
    if (existingReview) {  
      return NextResponse.json({
        success: true,
        hasReview: true,
        review: {
          id: existingReview.id,
          rating: existingReview.rating,
          title: existingReview.title,
          comment: existingReview.comment,
          createdAt: existingReview.createdAt.toISOString(),
          updatedAt: existingReview.updatedAt.toISOString(),
          reviewer: {
            id: existingReview.user.id,
            name: existingReview.user.name,
            avatar: existingReview.user.avatar,
          },
        },
      })
    }

    // Check if booking has customerRating/customerReview (legacy data)
    // if (booking.customerRating || booking.customerReview && existingReview) {
    //   return NextResponse.json({
    //     success: true,
        
    //     hasReview: true,
    //     review: {
    //       id: null,
    //       rating: booking.customerRating,
    //       title: null,
    //       comment: booking.customerReview,
    //       createdAt: null,
    //       updatedAt: null,
    //       reviewer: {
    //         id: session.id,
    //         name: session.name || 'Customer',
    //         avatar: null,
    //       },
    //     },
    //   })
    // }

    return NextResponse.json({
      success: true,
      hasReview: false,
      review: null,
    })
  } catch (error: any) {
    console.error('Error fetching review:', error)
    return NextResponse.json(
      { error: 'Failed to fetch review', details: error.message },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session || session.role !== 'CUSTOMER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const bookingId = params.bookingId
    const body = await request.json()
    const { rating, comment, title, riderId } = body

    // Validate required fields
    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Rating must be between 1 and 5' },
        { status: 400 }
      )
    }

    if (!comment || !comment.trim()) {
      return NextResponse.json(
        { error: 'Comment is required' },
        { status: 400 }
      )
    }

    if (!riderId) {
      return NextResponse.json(
        { error: 'Rider ID is required' },
        { status: 400 }
      )
    }
     // getRiderProfile by riderId
     const riderProfile = await prisma.riderProfile.findUnique({
      where: { userId: riderId },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
     })
     const newRiderId = riderProfile?.id
     

     if (!newRiderId) {
      return NextResponse.json(
        { error: 'Rider profile not found' },
        { status: 404 }
      )
     }


    // Find the booking (could be RideBooking or CourierBooking)
    let booking = await prisma.rideBooking.findUnique({
      where: { id: bookingId },
      include: {
        customer: { select: { id: true, name: true } },
        rider: {
          select: {
            id: true,
            name: true,
            riderProfile: {
              select: {
                id: true,
                rating: true,
                // reviews: true,
              },
            },
          },
        },
      },
    })

    let isCourierBooking = false

    if (!booking) {
      const courierBooking = await prisma.courierBooking.findUnique({
        where: { id: bookingId },
        include: {
          customer: { select: { id: true, name: true } },
          rider: {
            select: {
              id: true,
              name: true,
              riderProfile: {
                select: {
                  id: true,
                  rating: true,
                  // reviews: true,
                },
              },
            },
          },
        },
      })
      if (courierBooking) {
        booking = courierBooking as any
        isCourierBooking = true
      }
    }

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    // Verify the customer owns this booking
    if (booking.customerId !== session.id) {
      return NextResponse.json(
        { error: 'Unauthorized to review this booking' },
        { status: 403 }
      )
    }

    // Verify rider ID matches
    if (booking.riderId !== riderId) {
      return NextResponse.json(
        { error: 'Rider ID does not match booking' },
        { status: 400 }
      )
    }

    // Check if booking is completed
    if (booking.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Can only review completed bookings' },
        { status: 400 }
      )
    }

    // Check if review already exists (by userId, riderId, and bookingId stored in orderId for ride bookings)
    // Note: We use orderId field to store bookingId for ride/courier bookings since they don't have Order relation
    const existingReview = await prisma.review.findFirst({
      where: {
        userId: session.id,
        riderId: newRiderId,
        targetType: 'RIDER',
        bookingID: bookingId, // Match by bookingId stored in orderId field
      },
    })

    if (existingReview) {
      // Update existing review
      const updatedReview = await prisma.review.update({
        where: { id: existingReview.id },
        data: {
          rating,
          title: title || null,
          comment,
          updatedAt: new Date(),
        },
      })

      // Update booking with customer review
      if (isCourierBooking) {
        await prisma.courierBooking.update({
          where: { id: bookingId },
          data: {
            customerRating: rating,
            customerReview: comment,
          } as any,
        })
      } else {
        await prisma.rideBooking.update({
          where: { id: bookingId },
          data: {
            customerRating: rating,
            customerReview: comment,
          },
        })
      }

      // Recalculate rider's average rating
      await updateRiderRating(newRiderId)

      return NextResponse.json({
        success: true,
        message: 'Review updated successfully',
        review: updatedReview,
      })
    }

    // Create new review
    
    const newReview = await prisma.review.create({
      data: {
        userId: session.id,
        targetId: riderId, // The rider being reviewed
        targetType: 'RIDER',
          riderId: newRiderId,
          bookingID: bookingId,
        rating,
        title: title || null,
        comment,
      },
    })


    // Update booking with customer review
    if (isCourierBooking) {
      await prisma.courierBooking.update({
        where: { id: bookingId },
        data: {
          customerRating: rating,
          customerReview: comment,
        } as any,
      })
    } else {
      await prisma.rideBooking.update({
        where: { id: bookingId },
        data: {
          customerRating: rating,
          customerReview: comment,
        },
      })
    }

    // Update rider's average rating
    await updateRiderRating(newRiderId)

    // Send email to rider
    await sendEmailFromTemplate(riderProfile?.user.email || '', 'RIDER_REVIEW_RECEIVED', {
      customerName: session.name,
      riderName: booking?.rider?.name,
      rideType: isCourierBooking ? 'COURIER' : 'RIDE',
      rideId: bookingId,
      rating: rating,
      reviewComment: comment || '',
      dashboardUrl: `${process.env.APP_URL}/dashboard`,
      appName: process.env.APP_NAME || 'App',
    })

    // Send notification to rider
    await NotificationBridge.sendNotification({
      userId: riderId,
      title: 'New Review',
      message: `You have a new review from ${session.name}`,
      type: 'REVIEW_REQUEST',
      module: 'RIDING',
      actionUrl: `/riding/review/${bookingId}`,
      data: {
        actionType: "navigate",
        screen: 'CustomerRidingFeedback',
        params: [
          {
            name: 'bookingId',
            value: bookingId,
          },
          {
            name: 'ratingType',
            value: isCourierBooking ? 'COURIER' : 'RIDE',
          },
        ],
      },
    })
    

    return NextResponse.json({
      success: true,
      message: 'Review submitted successfully',
      review: newReview,
    })
  } catch (error: any) {
    console.error('Error submitting review:', error)
    return NextResponse.json(
      { error: 'Failed to submit review', details: error.message },
      { status: 500 }
    )
  }
}

async function updateRiderRating(riderId: string) {
  try {
    // Get all reviews for this rider
    const reviews = await prisma.review.findMany({
      where: {
        riderId: riderId,
        targetType: 'RIDER',
      },
      select: {
        rating: true,
      },
    })

    if (reviews.length === 0) return

    // Calculate average rating
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0)
    const averageRating = totalRating / reviews.length

    // Update rider profile
    const riderProfile = await prisma.riderProfile.findFirst({
      where: {
        userId: riderId,
      },
    })

    if (riderProfile) {
      await prisma.riderProfile.update({
        where: { id: riderProfile.id },
        data: {
          rating: averageRating,
          averageRating: averageRating,
        },
      })
    }
  } catch (error) {
    console.error('Error updating rider rating:', error)
  }
}

