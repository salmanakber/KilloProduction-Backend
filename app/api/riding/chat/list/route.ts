import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all bookings (ride or courier) where user is customer or rider
    const bookings = await prisma.rideBooking.findMany({
      where: {
        AND: [
          {
            OR: [
              { customerId: session.id },
              { riderId: session.id }
            ]
          },
          {
            OR: [
              { status: 'RIDER_ASSIGNED' },
              { status: 'ACCEPTED' },
              { status: 'ARRIVED_AT_PICKUP' },
              { status: 'PICKED_UP' },
              { status: 'IN_TRANSIT' },
              { status: 'EN_ROUTE_TO_PICKUP' },
              { status: 'EN_ROUTE_TO_DROPOFF' },
              
            ]
          }
        ]
      },
      include: {
        customer: { 
          select: { id: true, name: true, avatar: true, email: true } 
        },
        rider: { 
          select: { id: true, name: true, avatar: true, email: true } 
        },
        rideMessages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        _count: {
          select: {
            rideMessages: {
              where: {
                senderId: { not: session.id },
                isRead: false
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    })

    // Also get courier bookings
    const courierBookings = await prisma.courierBooking.findMany({
      where: {
        AND: [
          {
            OR: [
              { customerId: session.id },
              { riderId: session.id }
            ]
          },
          {
            OR: [
              { status: 'RIDER_ASSIGNED' },
              { status: 'ACCEPTED' },
              { status: 'ARRIVED_AT_PICKUP' },
              { status: 'PICKED_UP' },
              { status: 'IN_TRANSIT' },
              { status: 'EN_ROUTE_TO_PICKUP' },
              { status: 'EN_ROUTE_TO_DROPOFF' },
            ]
          }
        ]
      },
      include: {
        customer: { 
          select: { id: true, name: true, avatar: true, email: true } 
        },
        rider: { 
          select: { id: true, name: true, avatar: true, email: true } 
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    })

    // Format chats from ride bookings
    const formattedChats = bookings.map(booking => {
      const otherUser = session.id === booking.customerId 
        ? booking.rider 
        : booking.customer

      return {
        id: booking.id,
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        otherUserId: otherUser?.id || '',
        otherUserName: otherUser?.name || (session.id === booking.customerId ? 'Rider' : 'Customer'),
        otherUserAvatar: otherUser?.avatar,
        type: 'ride' as const,
        lastMessage: booking.rideMessages[0]?.message || '',
        lastMessageTime: booking.rideMessages[0]?.createdAt || booking.updatedAt,
        unreadCount: booking._count.rideMessages,
        status: 'ACTIVE' as const
      }
    })

    // Format chats from courier bookings - fetch messages separately
    const courierChatsPromises = courierBookings.map(async (booking) => {
      const otherUser = session.id === booking.customerId 
        ? booking.rider 
        : booking.customer

      // Get last message and unread count for courier booking
      const [lastMessage] = await prisma.rideMessage.findMany({
        where: { courierBookingId: booking.id } as any,
        orderBy: { createdAt: 'desc' },
        take: 1
      })

      const unreadCount = await prisma.rideMessage.count({
        where: {
          courierBookingId: booking.id,
          senderId: { not: session.id },
          isRead: false
        } as any
      })

      return {
        id: booking.id,
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        otherUserId: otherUser?.id || '',
        otherUserName: otherUser?.name || (session.id === booking.customerId ? 'Rider' : 'Customer'),
        otherUserAvatar: otherUser?.avatar,
        type: 'courier' as const,
        lastMessage: lastMessage?.message || '',
        lastMessageTime: lastMessage?.createdAt || booking.updatedAt,
        unreadCount: unreadCount,
        status: 'ACTIVE' as const
      }
    })

    const courierChats = await Promise.all(courierChatsPromises)

    // Combine and sort by last message time
    const allChats = [...formattedChats, ...courierChats].sort((a, b) => {
      const timeA = new Date(a.lastMessageTime).getTime()
      const timeB = new Date(b.lastMessageTime).getTime()
      return timeB - timeA
    })

    return NextResponse.json({ chats: allChats })
  } catch (error) {
    console.error('Error fetching chat list:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

