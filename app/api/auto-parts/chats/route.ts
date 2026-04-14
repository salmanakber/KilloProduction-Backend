import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get("vendorId")
    const requestId = searchParams.get("requestId")

    let chats: any[] = []

    if (user.role === "CUSTOMER") {
      // Customer can see chats with vendors
      if (vendorId) {
        chats = await prisma.autoPartsChat.findMany({
          where: {
            userId: user.id,
            vendorId,
            isActive: true,
          },
          include: {
            vendor: {
              select: {
                name: true,
                vendorProfile: {
                  select: {
                    businessName: true,
                    logo: true,
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                message: true,
                createdAt: true,
              },
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
      } else {
        chats = await prisma.autoPartsChat.findMany({
          where: {
            userId: user.id,
            isActive: true,
          },
          include: {
            vendor: {
              select: {
                name: true,
                vendorProfile: {
                  select: {
                    businessName: true,
                    logo: true,
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                message: true,
                createdAt: true,
              },
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
      }
    } else if (user.role === "VENDOR") {
      // Vendor can see chats with customers
      chats = await prisma.autoPartsChat.findMany({
        where: {
          vendorId: user.id,
          isActive: true,
        },
        include: {
          user: {
            select: {
              name: true,
              email: true,
              avatar: true,
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              message: true,
              createdAt: true,
            },
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
    }

    // Deduplicate chats - keep only the most recent chat for each user-vendor pair
    const chatMap = new Map<string, any>()
    
    for (const chat of chats) {
      // Create a unique key based on the participant pair
      const participantKey = user.role === "CUSTOMER" 
        ? `customer-${user.id}-vendor-${chat.vendorId}`
        : `customer-${chat.userId}-vendor-${user.id}`
      
      // If we haven't seen this pair before, or this chat is more recent, keep it
      const existingChat = chatMap.get(participantKey)
      if (!existingChat || new Date(chat.updatedAt) > new Date(existingChat.updatedAt)) {
        chatMap.set(participantKey, chat)
      }
    }
    
    // Convert map back to array
    const uniqueChats = Array.from(chatMap.values())
    
    // Sort by updatedAt descending
    uniqueChats.sort((a, b) => {
      const dateA = new Date(a.updatedAt).getTime()
      const dateB = new Date(b.updatedAt).getTime()
      return dateB - dateA
    })

    // Format chats with last message
    const formattedChats = uniqueChats.map((chat: any) => ({
      ...chat,
      lastMessage: chat.messages?.[0]?.message || null,
      lastMessageTime: chat.messages?.[0]?.createdAt || chat.updatedAt,
    }))

    return NextResponse.json({ chats: formattedChats })
  } catch (error) {
    console.error("Auto parts chats fetch error:", error)
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
    const { vendorId, requestId, offerId } = data

    if (user.role === "CUSTOMER" && !vendorId) {
      return NextResponse.json({ error: "Vendor ID required" }, { status: 400 })
    }

    if (user.role === "VENDOR" && !data.userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 })
    }

    // Check if chat already exists
    let chat
    if (user.role === "CUSTOMER") {
      chat = await prisma.autoPartsChat.findFirst({
        where: {
          userId: user.id,
          vendorId,
          requestId: requestId || null,
          offerId: offerId || null,
          isActive: true,
        },
      })
    } else {
      chat = await prisma.autoPartsChat.findFirst({
        where: {
          userId: data.userId,
          vendorId: user.id,
          requestId: requestId || null,
          offerId: offerId || null,
          isActive: true,
        },
      })
    }

    if (!chat) {
      // Create new chat
      chat = await prisma.autoPartsChat.create({
        data: {
          userId: user.role === "CUSTOMER" ? user.id : data.userId,
          vendorId: user.role === "CUSTOMER" ? vendorId : user.id,
          requestId: requestId || null,
          offerId: offerId || null,
        },
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
          vendor: {
            select: {
              name: true,
              vendorProfile: {
                select: {
                  businessName: true,
                  logo: true,
                },
              },
            },
          },
        },
      })
    }

    return NextResponse.json({ chat })
  } catch (error) {
    console.error("Auto parts chat creation error:", error)
    return NextResponse.json({ error: "Failed to create chat" }, { status: 500 })
  }
}


