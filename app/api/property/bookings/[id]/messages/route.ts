import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { ensurePropertyBookingConversation } from "@/lib/property-chat"
import { Module } from "@prisma/client"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const conversation = await ensurePropertyBookingConversation(params.id, user.id)
    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: "asc" },
    })

    await prisma.message.updateMany({
      where: {
        conversationId: conversation.id,
        senderId: { not: user.id },
        isRead: false,
      },
      data: { isRead: true },
    })

    const booking = await prisma.propertyBooking.findUnique({
      where: { id: params.id },
      include: {
        customer: { select: { id: true, name: true, avatar: true } },
        vendor: { select: { id: true, name: true, avatar: true } },
        listing: { select: { title: true } },
      },
    })

    return NextResponse.json({
      success: true,
      chat: { id: conversation.id, booking },
      messages: messages.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.sender.name,
        message: m.content,
        timestamp: m.createdAt.toISOString(),
        messageType: m.messageType,
        isRead: m.isRead,
      })),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load messages" },
      { status: 400 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { message, messageType = "TEXT" } = await request.json()
    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    const conversation = await ensurePropertyBookingConversation(params.id, user.id)
    const created = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: user.id,
        content: message.trim(),
        messageType,
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
      },
    })

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    })

    const booking = await prisma.propertyBooking.findUnique({
      where: { id: params.id },
      select: { customerId: true, vendorId: true, bookingNumber: true },
    })
    const recipientId =
      user.id === booking?.customerId ? booking?.vendorId : booking?.customerId
    if (recipientId) {
      const { NotificationBridge } = await import("@/lib/notification-bridge")
      await NotificationBridge.sendNotification({
        userId: recipientId,
        title: "New message",
        message: message.trim().slice(0, 120),
        type: "CHAT_MESSAGE",
        module: Module.PROPERTY,
        data: { propertyBookingId: params.id, conversationId: conversation.id },
      })
    }

    return NextResponse.json({
      success: true,
      message: {
        id: created.id,
        senderId: created.senderId,
        senderName: created.sender.name,
        message: created.content,
        timestamp: created.createdAt.toISOString(),
        messageType: created.messageType,
        isRead: created.isRead,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to send message" },
      { status: 400 }
    )
  }
}
