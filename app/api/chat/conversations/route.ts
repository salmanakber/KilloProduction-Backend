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

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ customerId: session.user.id }, { vendorId: session.user.id }],
      },
      include: {
        customer: {
          select: { id: true, name: true, profile: { select: { profileImage: true } } },
        },
        vendor: {
          select: { id: true, name: true, vendorProfile: { select: { businessName: true } } },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            senderId: true,
            isRead: true,
          },
        },
        _count: {
          select: {
            messages: {
              where: {
                senderId: { not: session.user.id },
                isRead: false,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json({ conversations })
  } catch (error) {
    console.error("Error fetching conversations:", error)
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { participantId, module, orderId } = await request.json()

    if (!participantId) {
      return NextResponse.json({ error: "Participant ID is required" }, { status: 400 })
    }

    // Check if conversation already exists
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { customerId: session.user.id, vendorId: participantId },
          { customerId: participantId, vendorId: session.user.id },
        ],
      },
    })

    if (existingConversation) {
      return NextResponse.json({ conversation: existingConversation })
    }

    // Determine roles
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    const participant = await prisma.user.findUnique({
      where: { id: participantId },
    })

    if (!currentUser || !participant) {
      return NextResponse.json({ error: "Invalid participants" }, { status: 400 })
    }

    const conversationData: any = {
      module: module || "GENERAL",
      orderId,
    }

    if (currentUser.role === "CUSTOMER") {
      conversationData.customerId = session.user.id
      conversationData.vendorId = participantId
    } else {
      conversationData.customerId = participantId
      conversationData.vendorId = session.user.id
    }

    const conversation = await prisma.conversation.create({
      data: conversationData,
      include: {
        customer: {
          select: { id: true, name: true, profile: { select: { profileImage: true } } },
        },
        vendor: {
          select: { id: true, name: true, vendorProfile: { select: { businessName: true } } },
        },
      },
    })

    return NextResponse.json({ conversation })
  } catch (error) {
    console.error("Error creating conversation:", error)
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 })
  }
}
