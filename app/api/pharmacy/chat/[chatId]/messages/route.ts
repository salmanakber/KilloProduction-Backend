import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'


async function getphramcyId(chatId: string) {
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { userId: chatId },
    select: {
      id: true,
    }
  })
  return pharmacy?.id || null
}



export async function GET(
  request: NextRequest,
  { params }: { params: { chatId: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const chatIdOrPharmacyId = params.chatId

    // First, try to find existing chat by ID
    let chat = await prisma.pharmacyChat.findFirst({
      where: {
        id: chatIdOrPharmacyId,
        OR: [
          { userId: session.id },
          { pharmacy: { userId: session.id } }
        ]
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        pharmacy: { 
          select: { 
            id: true, 
            pharmacyName: true, 
            logo: true,
            userId: true
          } 
        }
      }
    })

    // If not found by ID, check if it's a pharmacyId and find/create chat
    if (!chat) {
      // Check if a chat exists for this pharmacy and user
      chat = await prisma.pharmacyChat.findFirst({
        where: {
          pharmacyId: chatIdOrPharmacyId,
          userId: session.id
        },
        include: {
          user: { select: { id: true, name: true, avatar: true } },
          pharmacy: { 
            select: { 
              id: true, 
              pharmacyName: true, 
              logo: true,
              userId: true
            } 
          }
        }
      })

      // If still not found, create a new chat
      if (!chat) {
        // Verify pharmacy exists
        const pharmacy = await prisma.pharmacy.findUnique({
          where: { id: chatIdOrPharmacyId },
          select: { 
            id: true, 
            pharmacyName: true, 
            logo: true,
            userId: true
          }
        })

        if (!pharmacy) {
          return NextResponse.json({ error: 'Pharmacy not found' }, { status: 404 })
        }

        // Create new chat
        chat = await prisma.pharmacyChat.create({
          data: {
            pharmacyId: chatIdOrPharmacyId,
            userId: session.id,
            isActive: true
          },
          include: {
            user: { select: { id: true, name: true, avatar: true } },
            pharmacy: { 
              select: { 
                id: true, 
                pharmacyName: true, 
                logo: true,
                userId: true
              } 
            }
          }
        })
      }
    }

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    }

    const actualChatId = chat.id

    // Fetch messages
    const messages = await prisma.chatMessage.findMany({
      where: { chatId: actualChatId },
      orderBy: { createdAt: 'asc' }
    })

    // Format messages
    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      senderId: msg.senderId,
      senderName: msg.senderId === chat.userId ? chat.user.name : chat.pharmacy.pharmacyName,
      senderRole: msg.senderId === chat.userId ? 'CUSTOMER' : 'VENDOR',
      message: msg.message,
      timestamp: msg.createdAt,
      messageType: msg.type,
      fileUrl: msg.fileUrl,
      isRead: msg.isRead
    }))

    // Look up the most recent PrescriptionQueue linked to this chat (by chatId or customer+pharmacy pair)
    let prescriptionQueue = await prisma.prescriptionQueue.findFirst({
      where: { chatId: actualChatId },
      orderBy: { createdAt: 'desc' },
    })

    // Fallback: look up by customer + pharmacy
    if (!prescriptionQueue) {
      prescriptionQueue = await prisma.prescriptionQueue.findFirst({
        where: { customerId: chat.userId, pharmacyId: chat.pharmacyId },
        orderBy: { createdAt: 'desc' },
      })
    }

    return NextResponse.json({ 
      messages: formattedMessages,
      chat: {
        id: actualChatId,
        customerId: chat.userId,
        customerName: chat.user.name,
        pharmacyId: chat.pharmacyId,
        pharmacyName: chat.pharmacy.pharmacyName,
        isActive: chat.isActive,
        // Prescription queue data for hydrating ChatScreen
        queueId: prescriptionQueue?.id ?? null,
        prescription: prescriptionQueue?.prescriptionData ?? null,
        aiResponse: prescriptionQueue?.aiResponse ?? null,
        userPrompt: prescriptionQueue?.userPrompt ?? null,
        matchScore: prescriptionQueue?.matchScore ?? null,
        medicines: prescriptionQueue?.medicines ?? null,
        status: prescriptionQueue?.status ?? null,
        pharmacyNotes: prescriptionQueue?.pharmacyNotes ?? null,
        totalCost: prescriptionQueue?.totalCost ?? null,
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

    const chatIdOrPharmacyId = params.chatId

    // First, try to find existing chat by ID
    let chat = await prisma.pharmacyChat.findFirst({
      where: {
        id: chatIdOrPharmacyId,
        OR: [
          { userId: session.id },
          { pharmacy: { userId: session.id } }
        ]
      }
    })

    // If not found by ID, check if it's a pharmacyId
    if (!chat) {
      chat = await prisma.pharmacyChat.findFirst({
        where: {
          pharmacyId: chatIdOrPharmacyId,
          userId: session.id
        }
      })
    }

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    }

    const actualChatId = chat.id

    // Mark all messages not sent by current user as read
    await prisma.chatMessage.updateMany({
      where: {
        chatId: actualChatId,
        senderId: { not: session.id },
        isRead: false
      },
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

