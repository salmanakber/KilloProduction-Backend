import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { cloudinary } from '@/lib/cloudinary'
import { getGlobalSocketServer } from '@/lib/socket-server'
import { NotificationBridge } from '@/lib/notification-bridge'


export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contentType = request.headers.get('content-type')
    let messageData: any = {}
    let fileUrl: string | null = null
    let messageDuration: number = 0

    // Handle file uploads (audio, images, documents)
    if (contentType && contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      
      const file = formData.get('file') as File | null
      const chatId = formData.get('chatId') as string
      const bookingId = formData.get('bookingId') as string
      const message = formData.get('message') as string
      const messageType = formData.get('messageType') as string
      const duration = formData.get('duration') as string
      messageDuration = parseInt(duration || '0')

      const bookingIdToUse = bookingId || chatId

      if (!bookingIdToUse) {
        return NextResponse.json({ error: 'Booking ID or Chat ID required' }, { status: 400 })
      }

      // Verify booking exists and user has access
      let booking: any = await prisma.rideBooking.findFirst({
        where: {
          AND: [
            {
              OR: [
                { id: bookingIdToUse },
                { bookingNumber: bookingIdToUse }
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
          customer: { select: { id: true, name: true, avatar: true } },
          rider: { select: { id: true, name: true, avatar: true } }
        }
      })

      let isCourierBooking = false
      if (!booking) {
        booking = await prisma.courierBooking.findFirst({
          where: {
            AND: [
              {
                OR: [
                  { id: bookingIdToUse },
                  { bookingNumber: bookingIdToUse }
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
            customer: { select: { id: true, name: true, avatar: true } },
            rider: { select: { id: true, name: true, avatar: true } }
          }
        })
        isCourierBooking = !!booking
      }

      if (!booking) {
        return NextResponse.json({ error: 'Booking not found or unauthorized' }, { status: 404 })
      }

      // Upload file to Cloudinary FIRST - wait for completion before proceeding
      if (file) {
        try {
          console.log(`📤 Starting file upload for ${messageType}...`)
          const fileBuffer = Buffer.from(await file.arrayBuffer())
          const fileBase64 = fileBuffer.toString('base64')
          
          let folder = 'riding_chat_files'
          let resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto'
          let uploadOptions: any = { folder, resource_type: resourceType }
          
          if (messageType === 'IMAGE') {
            folder = 'riding_chat_images'
            resourceType = 'image'
            uploadOptions = {
              folder,
              resource_type: resourceType,
              transformation: [{ quality: 'auto', fetch_format: 'auto' }]
            }
          } else if (messageType === 'VOICE') {
            folder = 'riding_chat_audio'
            resourceType = 'video' // Use video for audio files for better compatibility
            uploadOptions = {
              folder,
              resource_type: resourceType,
              format: 'mp3',
            }
          } else if (messageType === 'FILE') {
            folder = 'riding_chat_documents'
            resourceType = 'raw'
            uploadOptions = { folder, resource_type: resourceType }
          }

          const uploadResult = await cloudinary.uploader.upload(
            `data:${file.type};base64,${fileBase64}`,
            uploadOptions
          )
          
          fileUrl = uploadResult.secure_url
          console.log(`✅ Uploaded ${messageType} to Cloudinary:`, fileUrl)
          
          // Verify fileUrl is not null/undefined before proceeding
          if (!fileUrl) {
            console.error('❌ File upload returned null/undefined fileUrl')
            return NextResponse.json({ error: 'File upload failed - no URL returned' }, { status: 500 })
          }
        } catch (uploadError) {
          console.error('❌ File upload error:', uploadError)
          return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
        }
      }

      // Only proceed with message creation after file upload is complete (if file was provided)
      messageData = {
        bookingId: booking.id,
        message: message || (messageType === 'IMAGE' ? 'Image' : messageType === 'VOICE' ? 'Voice message' : 'File'),
        messageType,
        fileUrl: fileUrl || null, // Explicitly set fileUrl (null if no file, Cloudinary URL if uploaded)
        isCourierBooking
      }
      
      console.log('📦 Message data prepared:', {
        hasFile: !!messageData.fileUrl,
        fileUrl: messageData.fileUrl,
        messageType: messageData.messageType
      })
    } else {
      // Handle JSON messages (text)
      const body = await request.json()
      const { chatId, bookingId, message, messageType = 'TEXT' } = body

      const bookingIdToUse = bookingId || chatId

      if (!bookingIdToUse) {
        return NextResponse.json({ error: 'Booking ID or Chat ID required' }, { status: 400 })
      }

      if (!message?.trim()) {
        return NextResponse.json({ error: 'Message required' }, { status: 400 })
      }

      // Verify booking exists and user has access
      let booking: any = await prisma.rideBooking.findFirst({
        where: {
          AND: [
            {
              OR: [
                { id: bookingIdToUse },
                { bookingNumber: bookingIdToUse }
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
          customer: { select: { id: true, name: true, avatar: true } },
          rider: { select: { id: true, name: true, avatar: true } }
        }
      })

      let isCourierBooking = false
      if (!booking) {
        booking = await prisma.courierBooking.findFirst({
          where: {
            AND: [
              {
                OR: [
                  { id: bookingIdToUse },
                  { bookingNumber: bookingIdToUse }
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
            customer: { select: { id: true, name: true, avatar: true } },
            rider: { select: { id: true, name: true, avatar: true } }
          }
        })
        isCourierBooking = !!booking
      }

      if (!booking) {
        return NextResponse.json({ error: 'Booking not found or unauthorized' }, { status: 404 })
      }

      messageData = {
        bookingId: booking.id,
        message,
        messageType,
        isCourierBooking
      }
    }

    // Create message for both ride and courier bookings
    // Ensure fileUrl is from the completed upload (not null if file was uploaded)
    const messageDataInput: any = {
      senderId: session.id,
      message: messageData.message,
      messageType: messageData.messageType || 'TEXT',
      fileUrl: messageData.fileUrl || null // Use messageData.fileUrl which contains the Cloudinary URL if uploaded
    }
    
    console.log('📝 Creating message with:', {
      messageType: messageDataInput.messageType,
      hasFileUrl: !!messageDataInput.fileUrl,
      fileUrl: messageDataInput.fileUrl
    })
    
    if (messageData.isCourierBooking) {
      messageDataInput.courierBookingId = messageData.bookingId
    } else {
      messageDataInput.rideBookingId = messageData.bookingId
    }

    const newMessage = await prisma.rideMessage.create({
      data: messageDataInput,
      include: {
        sender: { select: { id: true, name: true, avatar: true } }
      }
    })
    


    // Get booking info for socket
    let bookingForSocket: any = await prisma.rideBooking.findUnique({
      where: { id: messageData.bookingId },
      include: {
        customer: { select: { id: true, name: true, avatar: true } },
        rider: { select: { id: true, name: true, avatar: true } }
      }
    })

    if (!bookingForSocket) {
      bookingForSocket = await prisma.courierBooking.findUnique({
        where: { id: messageData.bookingId },
        include: {
          customer: { select: { id: true, name: true, avatar: true } },
          rider: { select: { id: true, name: true, avatar: true } }
        }
      })
    }

    if (!bookingForSocket) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Emit to socket (send to both sender and recipient)
    const socketServer = getGlobalSocketServer()
    const recipientId = bookingForSocket.customerId === session.id 
      ? bookingForSocket.riderId 
      : bookingForSocket.customerId

    if (bookingForSocket) {
      const senderName = session.id === bookingForSocket.customerId 
        ? bookingForSocket.customer.name 
        : (bookingForSocket.rider?.name || 'Rider')
      const senderAvatar = session.id === bookingForSocket.customerId 
        ? bookingForSocket.customer.avatar 
        : (bookingForSocket.rider?.avatar || null)
      const senderRole = session.id === bookingForSocket.customerId ? 'CUSTOMER' : 'RIDER'

      const messagePayload = {
        id: newMessage.id,
        senderId: session.id,
        senderName: senderName,
        senderAvatar: senderAvatar,
        senderRole: senderRole,
        message: newMessage.message,
        timestamp: newMessage.createdAt.toISOString(),
        messageType: newMessage.messageType,
        fileUrl: newMessage.fileUrl || null,
        duration: messageDuration || undefined,
        isRead: false
      }

      console.log('📨 Emitting chat_message to recipient:', recipientId, 'bookingId:', messageData.bookingId)
      console.log('📦 Message details from DB:', {
        messageType: newMessage.messageType,
        fileUrl: newMessage.fileUrl,
        hasFile: !!newMessage.fileUrl,
        fileUrlType: typeof newMessage.fileUrl,
        fileUrlLength: newMessage.fileUrl?.length,
        duration: messageDuration,
        messageId: newMessage.id
      })
      console.log('📦 Socket server stats:', socketServer.getStats())
      
      // Send to recipient
      if (recipientId) {
        // Use the fileUrl from newMessage or fallback to messageData (which has the Cloudinary URL)
        const finalFileUrl = newMessage.fileUrl || messageData.fileUrl
        
        const recipientPayload = {
          type: 'chat_message',
          chatId: messageData.bookingId,
          bookingId: messageData.bookingId, // Add bookingId for compatibility
          id: newMessage.id, // Add message ID
          senderId: session.id,
          senderName: senderName,
          senderAvatar: senderAvatar,
          senderRole: senderRole,
          message: newMessage.message,
          messageType: newMessage.messageType,
          fileUrl: finalFileUrl || null, // Use finalFileUrl (from DB or messageData)
          duration: messageDuration || undefined,
          timestamp: newMessage.createdAt.toISOString()
        }
        console.log('📤 Sending chat_message to recipient:', {
          userId: recipientId,
          fileUrlInPayload: recipientPayload.fileUrl,
          hasFileUrl: !!recipientPayload.fileUrl,
          fullPayload: JSON.stringify(recipientPayload, null, 2)
        })
        
        try {
          await socketServer.sendNotificationToUser(recipientId, recipientPayload)
          console.log('✅ Successfully sent chat_message to recipient with fileUrl:', recipientPayload.fileUrl)
        } catch (socketError) {
          console.error('❌ Error sending chat_message to recipient:', socketError)
        }
      } else {
        console.warn('⚠️ No recipientId found, cannot send socket event')
      }

      // Also send back to sender for confirmation (with real Cloudinary URL)
      // Use fileUrl from newMessage or fallback to messageData
      const finalFileUrlForConfirm = newMessage.fileUrl || messageData.fileUrl
      
      const confirmedPayload = {
        type: 'message_confirmed',
        chatId: messageData.bookingId,
        bookingId: messageData.bookingId, // Add bookingId for compatibility
        tempId: `temp-${Date.now()}`,
        message: {
          ...messagePayload,
          duration: messageDuration || undefined,
          fileUrl: finalFileUrlForConfirm || null, // Use finalFileUrl (from DB or messageData)
        }
      }
      console.log('📤 Sending message_confirmed to sender:', {
        userId: session.id,
        fileUrlInPayload: confirmedPayload.message.fileUrl,
        hasFileUrl: !!confirmedPayload.message.fileUrl,
        fullPayload: JSON.stringify(confirmedPayload, null, 2)
      })
      
      try {
        await socketServer.sendNotificationToUser(session.id, confirmedPayload)
        console.log('✅ Successfully sent message_confirmed to sender with fileUrl:', confirmedPayload.message.fileUrl)
      } catch (socketError) {
        console.error('❌ Error sending message_confirmed to sender:', socketError)
      }

      // Send push notification to the recipient (not the sender)
      if (recipientId && recipientId !== session.id) {
        try {
          await NotificationBridge.sendNotification({
            userId: recipientId,
            title: 'New Message',
            message: `${senderName} sent you a message`,
            type: 'CHAT_MESSAGE',
            module: 'RIDING',
            data: {
              chatId: messageData.bookingId,
              senderId: session.id,
              senderName: senderName,
              senderRole: senderRole,
              message: newMessage.message,
              messageType: newMessage.messageType,
              fileUrl: newMessage.fileUrl,
              duration: messageDuration || undefined,
              timestamp: newMessage.createdAt.toISOString()
            }
          })
          console.log('📱 Push notification sent to recipient:', recipientId)
        } catch (notifError) {
          console.error('Error sending push notification:', notifError)
          // Don't fail the request if notification fails
        }
      } else {
        console.warn('⚠️ No valid recipientId for notification:', { recipientId, senderId: session.id })
      }
    }

 

    return NextResponse.json({ 
      message: {
        id: newMessage.id,
        chatId: messageData.bookingId,
        senderId: newMessage.senderId,
        message: newMessage.message,
        messageType: newMessage.messageType,
        fileUrl: newMessage.fileUrl,
        isRead: newMessage.isRead,
        timestamp: newMessage.createdAt.toISOString()
      }
    })
  } catch (error: any) {
    console.error('Error sending message:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}


