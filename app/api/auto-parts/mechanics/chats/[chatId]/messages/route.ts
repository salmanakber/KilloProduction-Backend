import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"

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

    const messages = await prisma.autoPartsChatMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    })

    return NextResponse.json({ messages })
  } catch (error) {
    console.error("Get chat messages error:", error)
    return NextResponse.json({ error: "Failed to get messages" }, { status: 500 })
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
    const data = await request.json()
    const { message, messageType = "TEXT", fileUrl, duration } = data

    if (!message?.trim() && !fileUrl) {
      return NextResponse.json({ error: "Message or file is required" }, { status: 400 })
    }

    // Verify user has access to this chat
    const chat = await prisma.autoPartsChat.findFirst({
      where: {
        id: chatId,
        OR: [{ userId: user.id }, { vendorId: user.id }],
      },
      include: {
        user: { select: { id: true, name: true } },
        vendor: { 
          select: { 
            id: true, 
            name: true,
            mechanicProfile: {
              select: {
                businessName: true,
              },
            },
          } 
        },
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
        message: message || "",
        type: messageType,
        fileUrl,
        duration,
      },
      include: {
        sender: {
          select: {
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    })

    // Update chat timestamp
    await prisma.autoPartsChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    })

    // Notify the other party via socket
    const recipientId = user.id === chat.userId ? chat.vendorId : chat.userId
    const socketServer = getGlobalSocketServer()

    if (socketServer) {
      await socketServer.sendNotificationToUser(recipientId, {
        type: 'chat_message',
        chatId,
        senderId: user.id,
        senderName: user.name,
        message: chatMessage.message,
        messageType: chatMessage.type,
        fileUrl: chatMessage.fileUrl,
        timestamp: chatMessage.createdAt.toISOString(),
      })
    }

    try {
      const unreadFromSender = await prisma.autoPartsChatMessage.count({
        where: { chatId, senderId: user.id, isRead: false },
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
          message: `${user.name || "Someone"} sent ${unreadFromSender} message${unreadFromSender > 1 ? "s" : ""}.`,
          type: "AUTO_PARTS_CHAT",
          module: "AUTO_PARTS",
          data: {
            chatId,
            senderId: user.id,
            senderName: user.name,
            unreadCountSent: unreadFromSender,
          },
          actionUrl: `/auto-parts/chats/${chatId}`,
        })
      }
    } catch {}

    return NextResponse.json({ message: chatMessage })
  } catch (error) {
    console.error("Send chat message error:", error)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}



