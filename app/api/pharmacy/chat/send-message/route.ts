import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { cloudinary } from '@/lib/cloudinary'
import { getGlobalSocketServer } from '@/lib/socket-server'

async function getphramcyId(chatId: string) {
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { userId: chatId },
    select: {
      id: true,
    }
  })
  return pharmacy?.id || null
}



export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contentType = request.headers.get('content-type')
    let messageData: any = {}
    let fileUrl: string | null = null
    let uploadedFormData: FormData | null = null
    let messageDuration: number = 0

    // Handle file uploads (audio, images, documents)
    if (contentType && contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      uploadedFormData = formData
      
      const file = formData.get('file') as File | null
      const chatId = formData.get('chatId') as string
      const message = formData.get('message') as string
      const messageType = formData.get('messageType') as string
      const duration = formData.get('duration') as string
      messageDuration = parseInt(duration || '0')

      if (!chatId) {
        return NextResponse.json({ error: 'Chat ID required' }, { status: 400 })
      }

      // Upload file to Cloudinary
      if (file) {
        try {
          const fileBuffer = Buffer.from(await file.arrayBuffer())
          const fileBase64 = fileBuffer.toString('base64')
          
          let folder = 'chat_files'
          let resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto'
          let uploadOptions: any = { folder, resource_type: resourceType }
          
          if (messageType === 'IMAGE') {
            folder = 'chat_images'
            resourceType = 'image'
            uploadOptions = {
              folder,
              resource_type: resourceType,
              transformation: [{ quality: 'auto', fetch_format: 'auto' }]
            }
          } else if (messageType === 'VOICE') {
            folder = 'chat_audio'
            resourceType = 'video' // Use video for audio files for better compatibility
            uploadOptions = {
              folder,
              resource_type: resourceType,
              format: 'mp3', // Convert to mp3 for universal playback
            }
          } else if (messageType === 'FILE') {
            folder = 'chat_documents'
            resourceType = 'raw'
            uploadOptions = { folder, resource_type: resourceType }
          }

          const uploadResult = await cloudinary.uploader.upload(
            `data:${file.type};base64,${fileBase64}`,
            uploadOptions
          )
          
          fileUrl = uploadResult.secure_url
          console.log(`✅ Uploaded ${messageType} to Cloudinary:`, fileUrl)
        } catch (uploadError) {
          console.error('File upload error:', uploadError)
          return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
        }
      }

      messageData = {
        chatId,
        message: message || (messageType === 'IMAGE' ? 'Image' : messageType === 'VOICE' ? 'Voice message' : 'File'),
        messageType,
        fileUrl
      }
    } else {
      // Handle JSON messages (text)
      const body = await request.json()
      const { chatId, message, messageType = 'TEXT' } = body

      console.log('chatId', body)

      if (!chatId && !(await getphramcyId(chatId))) {
        return NextResponse.json({ error: 'Chat ID or Pharmacy ID required' }, { status: 400 })
      }

      if (!message?.trim()) {
        return NextResponse.json({ error: 'Message required' }, { status: 400 })
      }



      // Find or create chat
      let chat


      if (chatId) {
        chat = await prisma.pharmacyChat.findUnique({
          where: { id: chatId },
          include: {
            user: true,
            pharmacy: { include: { user: true } }
          }
        });
      }
      
      // If chatId was missing OR chat not found, find or create a new one
      if (!chat) {
        chat = await prisma.pharmacyChat.findFirst({
          where: {
            userId: session.id,
            pharmacyId: await getphramcyId(chatId) || ''
          },
          include: {
            user: true,
            pharmacy: { include: { user: true } }
          }
        });
      
        if (!chat) {
          chat = await prisma.pharmacyChat.create({
            data: {
              userId: session.id,
              pharmacyId: await getphramcyId(chatId) || '',
              isActive: true
            },
            include: {
              user: true,
              pharmacy: { include: { user: true } }
            }
          });
      
          console.log('chat created', chat);
      
          // Create notification for pharmacy on first message
          await prisma.notification.create({
            data: {
              userId: chat.pharmacy.userId,
              title: 'New Chat Message',
              message: `${chat.user.name || 'A customer'} sent you a message`,
              type: 'CHAT_MESSAGE',
              module: 'PHARMACY',
              data: {
                chatId: chat.id,
                customerId: session.id
              }
            }
          });
        }
      }
      
      if (!chat) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
      }
      

      messageData = {
        chatId: chat.id,
        message,
        messageType
      }
    }

    // Create message
    const newMessage = await prisma.chatMessage.create({
      data: {
        chatId: messageData.chatId,
        senderId: session.id,
        message: messageData.message,
        type: messageData.messageType || 'TEXT',
        fileUrl: fileUrl || messageData.fileUrl || null
      }
    })

    // Get chat info for socket
    const chat = await prisma.pharmacyChat.findUnique({
      where: { id: messageData.chatId },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        pharmacy: { 
          include: { 
            user: { select: { id: true, name: true, avatar: true } } 
          } 
        }
      }
    })

    // Emit to socket (send to both sender and recipient)
    const socketServer = getGlobalSocketServer()
    const recipientId = chat?.userId === session.id ? chat.pharmacy.userId : chat?.userId

    if (chat) {
      const messagePayload = {
        id: newMessage.id,
        senderId: session.id,
        senderName: chat.userId === session.id ? chat.user.name : chat.pharmacy.pharmacyName,
        senderRole: chat.userId === session.id ? 'CUSTOMER' : 'VENDOR',
        message: newMessage.message,
        timestamp: newMessage.createdAt,
        messageType: newMessage.type,
        fileUrl: newMessage.fileUrl,
        isRead: false
      }

      console.log('📨 Emitting chat_message to recipient:', recipientId, 'chatId:', messageData.chatId)
      
      // Send to recipient
      if (recipientId) {
        socketServer.sendNotificationToUser(recipientId, {
          type: 'chat_message',
          chatId: messageData.chatId,
          senderId: session.id,
          senderName: messagePayload.senderName,
          senderRole: messagePayload.senderRole,
          message: newMessage.message,
          messageType: newMessage.type,
          fileUrl: newMessage.fileUrl,
          duration: messageDuration || undefined,
          timestamp: newMessage.createdAt
        })
        console.log('📤 Sent to recipient with fileUrl:', newMessage.fileUrl)
      }

      // Also send back to sender for confirmation (with real Cloudinary URL)
      socketServer.sendNotificationToUser(session.id, {
        type: 'message_confirmed',
        chatId: messageData.chatId,
        tempId: `temp-${Date.now()}`,
        message: messagePayload
      })
    }

    return NextResponse.json({ 
      message: {
        id: newMessage.id,
        chatId: newMessage.chatId,
        senderId: newMessage.senderId,
        message: newMessage.message,
        messageType: newMessage.type,
        fileUrl: newMessage.fileUrl,
        isRead: newMessage.isRead,
        timestamp: newMessage.createdAt
      }
    })
  } catch (error: any) {
    console.error('Error sending message:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

