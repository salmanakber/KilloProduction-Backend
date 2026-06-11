import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveChatUserId } from "@/lib/resolve-chat-user"
import { Module } from "@prisma/client"

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveChatUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const moduleFilter = searchParams.get("module")

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ customerId: userId }, { vendorId: userId }],
        ...(moduleFilter ? { module: moduleFilter as Module } : {}),
      },
      include: {
        customer: {
          select: { id: true, name: true, avatar: true },
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
            attachments: true,
          },
        },
        _count: {
          select: {
            messages: {
              where: {
                senderId: { not: userId },
                isRead: false,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        if (conv.module !== Module.PROPERTY || !conv.orderId) {
          return { ...conv, propertyContext: null }
        }
        const booking = await prisma.propertyBooking.findUnique({
          where: { id: conv.orderId },
          select: {
            id: true,
            bookingNumber: true,
            checkIn: true,
            checkOut: true,
            status: true,
            listing: { select: { id: true, title: true, city: true, images: true } },
            customer: { select: { id: true, name: true, avatar: true } },
          },
        })
        if (booking) {
          const images = Array.isArray(booking.listing?.images)
            ? (booking.listing.images as string[])
            : []
          return {
            ...conv,
            propertyContext: {
              kind: "booking" as const,
              bookingId: booking.id,
              bookingNumber: booking.bookingNumber,
              checkIn: booking.checkIn.toISOString().slice(0, 10),
              checkOut: booking.checkOut.toISOString().slice(0, 10),
              status: booking.status,
              listingTitle: booking.listing?.title || "Property",
              listingCity: booking.listing?.city || "",
              listingImage: images[0] || null,
              guestName: booking.customer?.name || "Guest",
              guestAvatar: booking.customer?.avatar || null,
            },
          }
        }
        const listing = await prisma.propertyListing.findUnique({
          where: { id: conv.orderId },
          select: {
            id: true,
            title: true,
            city: true,
            images: true,
            vendor: { select: { id: true, name: true, avatar: true } },
          },
        })
        if (listing) {
          const images = Array.isArray(listing.images) ? (listing.images as string[]) : []
          return {
            ...conv,
            propertyContext: {
              kind: "inquiry" as const,
              listingId: listing.id,
              listingTitle: listing.title,
              listingCity: listing.city,
              listingImage: images[0] || null,
              hostName: listing.vendor?.name || "Host",
              hostAvatar: listing.vendor?.avatar || null,
            },
          }
        }
        return { ...conv, propertyContext: null }
      })
    )

    return NextResponse.json({ conversations: enriched })
  } catch (error) {
    console.error("Error fetching conversations:", error)
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveChatUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { participantId, module, orderId } = await request.json()

    if (!participantId) {
      return NextResponse.json({ error: "Participant ID is required" }, { status: 400 })
    }

    if (module && orderId) {
      const scoped = await prisma.conversation.findFirst({
        where: {
          module: module as Module,
          orderId,
          OR: [
            { customerId: userId, vendorId: participantId },
            { customerId: participantId, vendorId: userId },
          ],
        },
        include: {
          customer: {
            select: { id: true, name: true, avatar: true },
          },
          vendor: {
            select: { id: true, name: true, vendorProfile: { select: { businessName: true } } },
          },
        },
      })
      if (scoped) {
        return NextResponse.json({ conversation: scoped })
      }
    }

    const existingConversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { customerId: userId, vendorId: participantId },
          { customerId: participantId, vendorId: userId },
        ],
        ...(module ? { module: module as Module } : {}),
        ...(orderId ? { orderId } : {}),
      },
    })

    if (existingConversation) {
      return NextResponse.json({ conversation: existingConversation })
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
    })

    const participant = await prisma.user.findUnique({
      where: { id: participantId },
    })

    if (!currentUser || !participant) {
      return NextResponse.json({ error: "Invalid participants" }, { status: 400 })
    }

    const conversationData: {
      module: Module
      orderId?: string
      customerId: string
      vendorId: string
    } = {
      module: (module as Module) || Module.GENERAL,
      orderId,
      customerId: "",
      vendorId: "",
    }

    if (currentUser.role === "CUSTOMER") {
      conversationData.customerId = userId
      conversationData.vendorId = participantId
    } else {
      conversationData.customerId = participantId
      conversationData.vendorId = userId
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
