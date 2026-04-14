import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is a pharmacy or customer
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      include: {
        pharmacy: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let chats

    if (user.pharmacy) {
      // Pharmacy view - get all chats for this pharmacy
      chats = await prisma.pharmacyChat.findMany({
        where: {
          pharmacyId: user.pharmacy.id,
          isActive: true
        },
        include: {
          user: { 
            select: { id: true, name: true, avatar: true } 
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1
          },
          _count: {
            select: {
              messages: {
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

      const formattedChats = chats.map(chat => ({
        id: chat.id,
        customerId: chat.userId,
        customerName: chat.user.name || 'Customer',
        customerAvatar: chat.user.avatar,
        lastMessage: chat.messages[0]?.message || '',
        lastMessageTime: chat.messages[0]?.createdAt || chat.updatedAt,
        unreadCount: chat._count.messages,
        status: chat.isActive ? 'ACTIVE' : 'CLOSED'
      }))

      return NextResponse.json({ chats: formattedChats })
    } else {
      // Customer view - get all chats for this user
      chats = await prisma.pharmacyChat.findMany({
        where: {
          userId: session.id,
          isActive: true
        },
        include: {
          pharmacy: { 
            select: { 
              id: true, 
              pharmacyName: true, 
              logo: true,
              rating: true,
              isVerified: true
            } 
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1
          },
          _count: {
            select: {
              messages: {
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

      const formattedChats = chats.map(chat => ({
        id: chat.id,
        pharmacyId: chat.pharmacy.id,
        pharmacyName: chat.pharmacy.pharmacyName,
        pharmacyLogo: chat.pharmacy.logo,
        pharmacyRating: chat.pharmacy.rating,
        isVerified: chat.pharmacy.isVerified,
        lastMessage: chat.messages[0]?.message || '',
        lastMessageTime: chat.messages[0]?.createdAt || chat.updatedAt,
        unreadCount: chat._count.messages,
        status: chat.isActive ? 'ACTIVE' : 'CLOSED'
      }))

      return NextResponse.json({ chats: formattedChats })
    }
  } catch (error) {
    console.error('Error fetching chat list:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

