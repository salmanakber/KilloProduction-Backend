import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { chatId: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const chatIdOrBookingId = params.chatId

    // Find booking by ID or bookingNumber
    let booking = await prisma.rideBooking.findFirst({
      where: {
        AND: [
          {
            OR: [
              { id: chatIdOrBookingId },
              { bookingNumber: chatIdOrBookingId }
            ]
          },
          {
            OR: [
              { customerId: session.id },
              { riderId: session.id }
            ]
          }
        ]
      },
      include: {
        customer: { select: { id: true, name: true, email: true, avatar: true, } },
        rider: { select: { id: true, name: true, email: true, avatar: true } }
      }
    }) || await prisma.courierBooking.findFirst({
      where: {
        AND: [
          {
            OR: [
              { id: chatIdOrBookingId },
              { bookingNumber: chatIdOrBookingId }
            ]
          },
          {
            OR: [
              { customerId: session.id },
              { riderId: session.id }
            ]
          }
        ]
      },
      include: {
        customer: { select: { id: true, name: true, email: true, avatar: true } },
        rider: { select: { id: true, name: true, email: true, avatar: true } }
      }
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Verify user has access to this booking
    if (booking.customerId !== session.id && booking.riderId !== session.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const bookingId = booking.id
    const isCourierBooking = 'fare' in booking // CourierBooking has 'fare', RideBooking has 'estimatedFare'

    // Fetch messages - support both ride and courier bookings
    const whereClause: any = {}
    if (isCourierBooking) {
      whereClause.courierBookingId = bookingId
    } else {
      whereClause.rideBookingId = bookingId
    }

    const messages = await prisma.rideMessage.findMany({
      where: whereClause as any,
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, name: true, avatar: true } }
      }
    })

    // Determine other user
    const otherUser = session.id === booking.customerId 
      ? booking.rider || { id: '', name: 'Rider', email: '', avatar: null }
      : booking.customer || { id: '', name: 'Customer', email: '', avatar: null }

    // Format messages
    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      senderId: msg.senderId,
      senderName: msg.sender?.name || 'User',
      senderAvatar: msg.sender?.avatar || null,
      senderRole: msg.senderId === booking.customerId ? 'CUSTOMER' : 'RIDER',
      message: msg.message,
      timestamp: msg.createdAt.toISOString(),
      messageType: msg.messageType,
      fileUrl: msg.fileUrl,
      isRead: msg.isRead,
      duration: msg.messageType === 'VOICE' ? undefined : undefined
    }))

    return NextResponse.json({ 
      messages: formattedMessages,
      chat: {
        id: bookingId,
        bookingId: bookingId,
        bookingNumber: booking.bookingNumber,
        customerId: booking.customerId,
        customerName: booking.customer.name,
        customerAvatar: booking.customer.avatar,
        riderId: booking.riderId,
        riderName: booking.rider?.name || 'Rider',
        riderAvatar: booking.rider?.avatar || null,
        otherUserName: otherUser.name,
        otherUserAvatar: otherUser.avatar || null,
        isActive: true
      }
    })
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Mark messages as read
export async function POST(
  request: NextRequest,
  { params }: { params: { chatId: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const chatIdOrBookingId = params.chatId

    // Find booking
    let booking = await prisma.rideBooking.findFirst({
      where: {
        AND: [
          {
            OR: [
              { id: chatIdOrBookingId },
              { bookingNumber: chatIdOrBookingId }
            ]
          },
          {
            OR: [
              { customerId: session.id },
              { riderId: session.id }
            ]
          }
        ]
      }
    }) || await prisma.courierBooking.findFirst({
      where: {
        AND: [
          {
            OR: [
              { id: chatIdOrBookingId },
              { bookingNumber: chatIdOrBookingId }
            ]
          },
          {
            OR: [
              { customerId: session.id },
              { riderId: session.id }
            ]
          }
        ]
      }
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const bookingId = booking.id

    const isCourierBooking = 'fare' in booking // CourierBooking has 'fare', RideBooking has 'estimatedFare'

    // Mark all messages not sent by current user as read
    const whereClause: any = {
      senderId: { not: session.id },
      isRead: false
    }
    if (isCourierBooking) {
      whereClause.courierBookingId = bookingId
    } else {
      whereClause.rideBookingId = bookingId
    }

    await prisma.rideMessage.updateMany({
      where: whereClause as any,
      data: {
        isRead: true
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error marking messages as read:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

