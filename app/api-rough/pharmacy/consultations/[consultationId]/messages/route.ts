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
        consumer: { select: { id: true } },
        pharmacy: { select: { userId: true } },
      },
    })

    if (!consultation) {
      return NextResponse.json({ error: "Consultation not found" }, { status: 404 })
    }

    const hasAccess =
      consultation.consumerId === user.id || consultation.pharmacy?.userId === user.id || user.role === "ADMIN"

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const messages = await prisma.consultationMessage.findMany({
      where: { consultationId },
      orderBy: { createdAt: "asc" },
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
    const data = await request.json()
    const { content, messageType, fileUrl, recommendedMedicines, totalCost, dosageInstructions } = data

    // Verify user has access to this consultation
    const consultation = await prisma.pharmConsultation.findUnique({
      where: { id: consultationId },
      include: {
        consumer: { select: { id: true } },
        pharmacy: { select: { userId: true, pharmacyName: true } },
      },
    })

    if (!consultation) {
      return NextResponse.json({ error: "Consultation not found" }, { status: 404 })
    }

    const isConsumer = consultation.consumerId === user.id
    const isPharmacist = consultation.pharmacy?.userId === user.id

    if (!isConsumer && !isPharmacist) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Determine sender type
    let senderType = "CONSUMER"
    if (isPharmacist) senderType = "PHARMACIST"

    // Create message
    const message = await prisma.consultationMessage.create({
      data: {
        consultationId,
        senderId: user.id,
        senderType,
        content,
        messageType: messageType || "TEXT",
        fileUrl,
      },
    })

    // If pharmacist is providing recommendations, update consultation
    if (isPharmacist && recommendedMedicines) {
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

    // Send notification to the other party
    const recipientId = isConsumer ? consultation.pharmacy?.userId : consultation.consumerId
    if (recipientId) {
      await prisma.notification.create({
        data: {
          userId: recipientId,
          title: "New Message",
          message: isConsumer
            ? "You have a new message from a customer"
            : `New message from ${consultation.pharmacy?.pharmacyName}`,
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
