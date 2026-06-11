import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveChatUserId } from "@/lib/resolve-chat-user"
import { Module } from "@prisma/client"

export async function GET(
  request: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  try {
    const userId = await resolveChatUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const conversationId = params.conversationId

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ customerId: userId }, { vendorId: userId }],
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.message.count({ where: { conversationId } }),
    ])

    await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true, readAt: new Date() },
    })

    return NextResponse.json({
      messages: messages.reverse(),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching conversation messages:", error)
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  try {
    const userId = await resolveChatUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const conversationId = params.conversationId
    const body = await request.json()
    const content = body.content ?? body.message
    const { messageType, attachments } = body

    if (!content) {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 })
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ customerId: userId }, { vendorId: userId }],
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        content,
        messageType: messageType || "TEXT",
        attachments,
      },
      include: {
        sender: {
          select: { id: true, name: true, avatar: true },
        },
      },
    })
    

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })

    if (conversation.module === Module.PROPERTY) {
      const recipientId =
        userId === conversation.customerId ? conversation.vendorId : conversation.customerId
      if (recipientId) {
        const inquiry = (attachments as any)?.propertyInquiry
        const listingShare = (attachments as any)?.propertyListingShare
        const preview = inquiry
          ? `New inquiry: ${inquiry.listing?.title || "your property"} · ${inquiry.checkIn || ""}`
          : listingShare
            ? `Shared listing: ${listingShare.title || "a property"}`
            : typeof content === "string"
              ? content.slice(0, 120)
              : "New message"
        const { NotificationBridge } = await import("@/lib/notification-bridge")
        const saved = await NotificationBridge.sendNotification({
          userId: recipientId,
          title: inquiry ? "New booking inquiry" : "New message",
          message: preview,
          type: "CHAT_MESSAGE",
          module: Module.PROPERTY,
          data: {
            conversationId,
            orderId: conversation.orderId,
          },
        })

        try {
          const { getSocketServer } = await import("@/lib/socket-init")
          const socketServer = getSocketServer()
          const chatPayload = {
            id: message.id,
            conversationId,
            chatId: conversationId,
            senderId: userId,
            senderName: message.sender?.name,
            senderAvatar: message.sender?.avatar,
            message: content,
            messageType: message.messageType,
            attachments,
            timestamp: message.createdAt.toISOString(),
            module: Module.PROPERTY,
            orderId: conversation.orderId,
          }
          socketServer.emitEventToUser(recipientId, "chat_message", chatPayload)
          socketServer.emitToPropertyChatRoom(conversationId, "chat_message", chatPayload)
          socketServer.emitEventToUser(recipientId, "notification", {
            id: saved?.id || `chat-${message.id}`,
            userId: recipientId,
            title: inquiry ? "New booking inquiry" : "New message",
            message: preview,
            type: "CHAT_MESSAGE",
            module: Module.PROPERTY,
            data: { conversationId, orderId: conversation.orderId },
            isRead: false,
            createdAt: message.createdAt.toISOString(),
            status: "SENT",
          })
          await socketServer.emitNotificationCountToUser(recipientId)
        } catch (socketErr) {
          console.error("Property chat socket emit failed:", socketErr)
        }
      }
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error("Error sending conversation message:", error)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
