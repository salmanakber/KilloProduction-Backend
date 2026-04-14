import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: { chatId: string } }) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { chatId } = params

    // Verify user has access to this chat
    const chat = await prisma.pharmacyChat.findFirst({
      where: {
        id: chatId,
        OR: [{ userId: user.id }, { pharmacy: { userId: user.id } }],
      },
    })

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    const messages = await prisma.chatMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
    })

    return NextResponse.json({ messages })
  } catch (error) {
    console.error("Chat messages fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { chatId: string } }) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { chatId } = params
    const data = await request.json()
    const { message, type = "TEXT", fileUrl } = data

    // Verify user has access to this chat
    const chat = await prisma.pharmacyChat.findFirst({
      where: {
        id: chatId,
        OR: [{ userId: user.id }, { pharmacy: { userId: user.id } }],
      },
    })

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    const chatMessage = await prisma.chatMessage.create({
      data: {
        chatId,
        senderId: user.id,
        message,
        type,
        fileUrl,
      },
    })

    // Update chat timestamp
    await prisma.pharmacyChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    })

    return NextResponse.json(chatMessage, { status: 201 })
  } catch (error) {
    console.error("Chat message creation error:", error)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
