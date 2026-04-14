import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const chats = await prisma.pharmacyChat.findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      include: {
        pharmacy: {
          select: {
            pharmacyName: true,
            logo: true,
            is24Hours: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: {
          select: {
            messages: {
              where: {
                isRead: false,
                senderId: { not: user.id },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json({ chats })
  } catch (error) {
    console.error("Pharmacy chats fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch chats" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    const { pharmacyId, prescriptionId } = data

    // Check if chat already exists
    let chat = await prisma.pharmacyChat.findFirst({
      where: {
        userId: user.id,
        pharmacyId,
        prescriptionId: prescriptionId || null,
        isActive: true,
      },
    })

    if (!chat) {
      // Create new chat
      chat = await prisma.pharmacyChat.create({
        data: {
          userId: user.id,
          pharmacyId,
          prescriptionId: prescriptionId || null,
        },
      })
    }

    return NextResponse.json({ chat })
  } catch (error) {
    console.error("Pharmacy chat creation error:", error)
    return NextResponse.json({ error: "Failed to create chat" }, { status: 500 })
  }
}
