import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: { consultationId: string } }) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const { consultationId } = params

    // Verify user has access to this consultation
    const consultation = await prisma.pharmConsultation.findUnique({
      where: { id: consultationId },
      include: {
        pharmacy: {
          select: { userId: true },
        },
      },
    })

    if (!consultation) {
      return NextResponse.json({ error: "Consultation not found" }, { status: 404 })
    }

    // Check if user is the consumer or the pharmacy owner
    const hasAccess =
      consultation.consumerId === user.id || consultation.pharmacy?.userId === user.id || user.role === "ADMIN"

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const messages = await prisma.consultationMessage.findMany({
      where: { consultationId },
      orderBy: { createdAt: "asc" },
    })

    // Mark messages as read for the current user
    await prisma.consultationMessage.updateMany({
      where: {
        consultationId,
        senderId: { not: user.id },
        isRead: false,
      },
      data: { isRead: true },
    })

    return NextResponse.json({ messages })
  } catch (error) {
    console.error("Messages fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { consultationId: string } }) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const { consultationId } = params
    const { content, messageType, fileUrl, recommendedMedicines, totalCost, dosageInstructions } = await request.json()

    if (!content && !fileUrl) {
      return NextResponse.json({ error: "Message content or file is required" }, { status: 400 })
    }

    // Verify user has access to this consultation
    const consultation = await prisma.pharmConsultation.findUnique({
      where: { id: consultationId },
      include: {
        pharmacy: {
          select: { userId: true },
        },
      },
    })

    if (!consultation) {
      return NextResponse.json({ error: "Consultation not found" }, { status: 404 })
    }

    // Determine sender type
    let senderType = "CONSUMER"
    if (consultation.pharmacy?.userId === user.id) {
      senderType = "PHARMACIST"
    } else if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
      senderType = "SUPER_PHARM"
    }

    // Create message
    const message = await prisma.consultationMessage.create({
      data: {
        consultationId,
        senderId: user.id,
        senderType: senderType as any,
        content,
        messageType: messageType || "TEXT",
        fileUrl,
      },
    })

    // If pharmacist is providing recommendations, update consultation
    if (senderType === "PHARMACIST" && recommendedMedicines) {
      await prisma.pharmConsultation.update({
        where: { id: consultationId },
        data: {
          recommendedMedicines,
          totalCost,
          dosageInstructions,
          status: "RESPONDED",
          respondedAt: new Date(),
        },
      })
    }

    // Update consultation status if needed
    if (consultation.status === "PENDING" || consultation.status === "ASSIGNED") {
      await prisma.pharmConsultation.update({
        where: { id: consultationId },
        data: { status: "IN_PROGRESS" },
      })
    }

    // Send notification to the other party
    const recipientId = senderType === "CONSUMER" ? consultation.pharmacy?.userId : consultation.consumerId

    if (recipientId) {
      await prisma.notification.create({
        data: {
          userId: recipientId,
          title: "New Message",
          message: `New message in consultation #${consultation.consultationNumber}`,
          type: "CHAT_MESSAGE",
          module: "PHARMACY",
          data: { consultationId, messageId: message.id },
        },
      })
    }

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    console.error("Message creation error:", error)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
