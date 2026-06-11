import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveChatUserId } from "@/lib/resolve-chat-user"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  try {
    const userId = await resolveChatUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: params.conversationId,
        OR: [{ customerId: userId }, { vendorId: userId }],
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    }

    await prisma.message.updateMany({
      where: {
        conversationId: params.conversationId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true, readAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error marking conversation read:", error)
    return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 })
  }
}
