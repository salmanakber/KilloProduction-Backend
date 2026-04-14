import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get("conversationId")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "50")

    if (!conversationId) {
      return NextResponse.json({ error: "Conversation ID is required" }, { status: 400 })
    }

    // Verify user is part of conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ customerId: session.user.id }, { vendorId: session.user.id }],
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
            select: { id: true, name: true, profile: { select: { profileImage: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.message.count({ where: { conversationId } }),
    ])

    // Mark messages as read
    await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: session.user.id },
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
    console.error("Error fetching messages:", error)
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { conversationId, content, messageType, attachments } = await request.json()

    if (!conversationId || !content) {
      return NextResponse.json({ error: "Conversation ID and content are required" }, { status: 400 })
    }

    // Verify user is part of conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ customerId: session.user.id }, { vendorId: session.user.id }],
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: session.user.id,
        content,
        messageType: messageType || "TEXT",
        attachments,
      },
      include: {
        sender: {
          select: { id: true, name: true, profile: { select: { profileImage: true } } },
        },
      },
    })

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })

    return NextResponse.json({ message })
  } catch (error) {
    console.error("Error sending message:", error)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
