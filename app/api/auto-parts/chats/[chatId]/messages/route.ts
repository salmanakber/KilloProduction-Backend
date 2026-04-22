import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { cloudinary } from "@/lib/cloudinary"

export async function GET(
  request: NextRequest,
  { params }: { params: { chatId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { chatId } = params

    // Verify user has access to this chat
    const chat = await prisma.autoPartsChat.findFirst({
      where: {
        id: chatId,
        OR: [{ userId: user.id }, { vendorId: user.id }],
      },
    })

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    // Get messages
    const messages = await prisma.autoPartsChatMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
      include: {
        sender: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    // Get offer if chat has offerId
    let offerMessage = null
    if (chat.offerId) {
      const offer = await prisma.partOffer.findUnique({
        where: { id: chat.offerId },
        include: {
          vendor: {
            select: {
              name: true,
              vendorProfile: {
                select: {
                  businessName: true,
                  logo: true,
                },
              },
            },
          },
          mechanic: {
            select: {
              name: true,
              mechanicProfile: {
                select: {
                  businessName: true,
                  logo: true,
                  rating: true,
                },
              },
            },
          },
          request: {
            select: {
              id: true,
              partName: true,
              vehicleBrand: true,
              vehicleModel: true,
              vehicleYear: true,
              maxBudget: true,
            },
          },
        },
      })

      if (offer) {
        // Create offer message as first message
        offerMessage = {
          id: `offer-${offer.id}`,
          chatId: chatId,
          senderId: offer.vendorId,
          message: `Offer for ${offer.request?.partName || 'Part'}: ${offer.price} - ${offer.condition} - ${offer.deliveryTime}`,
          type: "OFFER" as any,
          fileUrl: null,
          isRead: true,
          createdAt: offer.createdAt.toISOString(),
          isOffer: true,
          offer: {
            id: offer.id,
            price: offer.price,
            condition: offer.condition,
            availability: offer.availability,
            deliveryTime: offer.deliveryTime,
            warranty: offer.warranty,
            description: offer.description,
            images: offer.images,
            vendor: offer.vendor,
            mechanic: offer.mechanic,
            request: offer.request,
          },
          sender: offer.vendor,
        }
      }
    }

    // Mark messages as read
    await prisma.autoPartsChatMessage.updateMany({
      where: {
        chatId,
        senderId: { not: user.id },
        isRead: false,
      },
      data: { isRead: true },
    })

    // Combine offer message with regular messages
    const allMessages = offerMessage ? [offerMessage, ...messages] : messages

    return NextResponse.json({ messages: allMessages })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { chatId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { chatId } = params
    let messageData: any
    let fileUrl: string | null = null
    let messageDuration: number | undefined = undefined

    // Check if request is FormData (file upload) or JSON
    const contentType = request.headers.get("content-type") || ""
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData()
      const file = formData.get("file") as File | null
      const message = formData.get("message") as string || ""
      const messageType = (formData.get("messageType") as string) || "TEXT"
      const duration = formData.get("duration") as string | null

      messageData = { message, messageType }
      
      if (duration) {
        messageDuration = parseInt(duration)
      }

      // Upload file to Cloudinary FIRST - wait for completion before proceeding
      if (file) {
        try {
          const fileBuffer = Buffer.from(await file.arrayBuffer())
          const fileBase64 = fileBuffer.toString('base64')
          
          let folder = 'auto_parts_chat_files'
          let resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto'
          let uploadOptions: any = { folder, resource_type: resourceType }
          
          if (messageType === 'IMAGE') {
            folder = 'auto_parts_chat_images'
            resourceType = 'image'
            uploadOptions = {
              folder,
              resource_type: resourceType,
              transformation: [{ quality: 'auto', fetch_format: 'auto' }]
            }
          } else if (messageType === 'VOICE') {
            folder = 'auto_parts_chat_audio'
            resourceType = 'video' // Use video for audio files for better compatibility
            uploadOptions = {
              folder,
              resource_type: resourceType,
              format: 'mp3',
            }
          } else if (messageType === 'FILE') {
            folder = 'auto_parts_chat_documents'
            resourceType = 'raw'
            uploadOptions = { folder, resource_type: resourceType }
          }

          const uploadResult = await cloudinary.uploader.upload(
            `data:${file.type};base64,${fileBase64}`,
            uploadOptions
          )
          
          fileUrl = uploadResult.secure_url
          // Verify fileUrl is not null/undefined before proceeding
          if (!fileUrl) {
            return NextResponse.json({ error: 'File upload failed - no URL returned' }, { status: 500 })
          }
        } catch (uploadError) {
          return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
        }
      }
    } else {
      // Handle JSON request
      const data = await request.json()
      messageData = data
      fileUrl = data.fileUrl || null
    }

    const { message, messageType = "TEXT" } = messageData

    // Verify user has access to this chat
    const chat = await prisma.autoPartsChat.findFirst({
      where: {
        id: chatId,
        OR: [{ userId: user.id }, { vendorId: user.id }],
      },
      include: {
        user: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
      },
    })

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    // Create message
    const chatMessage = await prisma.autoPartsChatMessage.create({
      data: {
        chatId,
        senderId: user.id,
        message,
        type: messageType,
        fileUrl,
        duration: messageDuration,
      },
      include: {
        sender: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    // Update chat timestamp
    await prisma.autoPartsChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    })

    // Notify the other party
    const recipientId = user.id === chat.userId ? chat.vendorId : chat.userId
    const recipientName = user.id === chat.userId ? chat.vendor?.name : chat.user?.name
    const senderName = user.id === chat.userId ? chat.user?.name : (chat.vendor?.vendorProfile?.businessName || chat.vendor?.name || "Vendor")
    const senderRole = user.id === chat.userId ? 'CUSTOMER' : 'VENDOR'

    // Emit to socket (send to both sender and recipient)
    const socketServer = getGlobalSocketServer()

    if (chat) {
      const messagePayload = {
        id: chatMessage.id,
        senderId: user.id,
        senderName: senderName,
        senderRole: senderRole,
        message: chatMessage.message,
        timestamp: chatMessage.createdAt,
        messageType: chatMessage.type,
        fileUrl: chatMessage.fileUrl || null,
        duration: chatMessage.duration || messageDuration ,
        fileName: messageData.fileName || '',
        fileSize: messageData.fileSize || 0,
        isRead: false
      }

      // Send to recipient via socket
      if (recipientId) {
        const chatMessageNotification = {
          type: 'chat_message',
          chatId: chatId,
          id: chatMessage.id,
          senderId: user.id,
          senderName: senderName,
          senderRole: senderRole,
          message: chatMessage.message,
          messageType: chatMessage.type,
          fileUrl: chatMessage.fileUrl || null,
          duration: chatMessage.duration || messageDuration || undefined,
          fileName: messageData.fileName || undefined,
          fileSize: messageData.fileSize || undefined,
          timestamp: chatMessage.createdAt.toISOString(),
          isRead: false
        }


        const aa = await socketServer.sendNotificationToUser(recipientId, chatMessageNotification)
        console.log('🔔 Chat message notification:', aa)
      }

      // Also emit new_message event for subscribeToChat
      socketServer.sendNotificationToUser(recipientId, {
        type: 'chat_message',
        chatId: chatId,
        message: messagePayload
      })

      // Also send back to sender for confirmation (with real Cloudinary URL)
      socketServer.sendNotificationToUser(user.id, {
        type: 'message_confirmed',
        chatId: chatId,
        tempId: `temp-${Date.now()}`,
        message: messagePayload
      })
    }

    // Send push notification
    try {
      const unreadFromSender = await prisma.autoPartsChatMessage.count({
        where: {
          chatId,
          senderId: user.id,
          isRead: false,
        },
      })

      const recentChatNotifs = await prisma.notification.findMany({
        where: {
          userId: recipientId,
          type: "AUTO_PARTS_CHAT" as any,
          module: "AUTO_PARTS" as any,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      })
      const latestForChat = recentChatNotifs.find(
        (n: any) => String((n.data as any)?.chatId || "") === String(chatId)
      ) as any

      const twoHoursMs = 2 * 60 * 60 * 1000
      const nowTs = Date.now()
      const latestTs = latestForChat ? new Date(latestForChat.createdAt).getTime() : 0
      const lastUnreadCount = Number((latestForChat?.data as any)?.unreadCountSent || 0)
      const hit7MsgThreshold = unreadFromSender >= 7 && unreadFromSender - lastUnreadCount >= 7
      const hit2HourThreshold = !latestForChat || nowTs - latestTs >= twoHoursMs

      if (hit7MsgThreshold || hit2HourThreshold) {
        await NotificationBridge.sendNotification({
          userId: recipientId,
          title: "New auto parts messages",
          message: `${senderName || user.name || "Someone"} sent ${unreadFromSender} message${unreadFromSender > 1 ? "s" : ""}.`,
          type: "AUTO_PARTS_CHAT",
          module: "AUTO_PARTS",
          data: {
            chatId,
            senderId: user.id,
            senderName: senderName || user.name,
            unreadCountSent: unreadFromSender,
          },
          actionUrl: `/auto-parts/chats/${chatId}`,
        })
      }
    } catch (notifError) {
      // Chat notification error
    }

    return NextResponse.json(chatMessage, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}


