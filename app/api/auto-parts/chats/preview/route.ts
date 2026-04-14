import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

/** Vendor: unread count + last customer messages for a request/offer-scoped chat */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const requestId = searchParams.get("requestId")
    const offerId = searchParams.get("offerId")

    if (!requestId || !offerId) {
      return NextResponse.json({ error: "requestId and offerId are required" }, { status: 400 })
    }

    const chat = await prisma.autoPartsChat.findFirst({
      where: {
        vendorId: user.id,
        requestId,
        offerId,
        isActive: true,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    })

    if (!chat) {
      return NextResponse.json({
        chat: null,
        chatId: null,
        customerUserId: null,
        customerName: null,
        unreadCount: 0,
        previewMessages: [] as { id: string; message: string; createdAt: string }[],
      })
    }

    const unreadCount = await prisma.autoPartsChatMessage.count({
      where: {
        chatId: chat.id,
        isRead: false,
        senderId: chat.userId,
      },
    })

    const previewMessages = await prisma.autoPartsChatMessage.findMany({
      where: {
        chatId: chat.id,
        senderId: chat.userId,
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, message: true, createdAt: true },
    })

    return NextResponse.json({
      chatId: chat.id,
      customerUserId: chat.userId,
      customerName: chat.user?.name || null,
      unreadCount,
      previewMessages: previewMessages.reverse().map((m) => ({
        id: m.id,
        message: m.message,
        createdAt: m.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error("Auto parts chat preview error:", error)
    return NextResponse.json({ error: "Failed to load chat preview" }, { status: 500 })
  }
}
