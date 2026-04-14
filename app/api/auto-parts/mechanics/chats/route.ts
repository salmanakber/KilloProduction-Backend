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
    const mechanicId = searchParams.get("mechanicId")
    const requestId = searchParams.get("requestId")

    let chats: any[] = []

    if (user.role === "CUSTOMER") {
      // Customer can see chats with mechanics
      if (mechanicId) {
        chats = await prisma.autoPartsChat.findMany({
          where: {
            userId: user.id,
            vendorId: mechanicId, // Using vendorId field for mechanicId in AutoPartsChat
            isActive: true,
          },
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
                mechanicProfile: {
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
        // Get all chats for customer with mechanics
        chats = await prisma.autoPartsChat.findMany({
          where: {
            userId: user.id,
            isActive: true,
            vendor: {
              role: "MECHANIC",
            },
          },
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
                mechanicProfile: {
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
    } else if (user.role === "MECHANIC") {
      // Mechanic can see chats with customers
      chats = await prisma.autoPartsChat.findMany({
        where: {
          vendorId: user.id,
          isActive: true,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
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

    return NextResponse.json({ chats })
  } catch (error) {
    console.error("Get mechanic chats error:", error)
    return NextResponse.json({ error: "Failed to get chats" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    const { mechanicId, requestId, offerId } = data

    if (user.role === "CUSTOMER" && !mechanicId) {
      return NextResponse.json({ error: "Mechanic ID required" }, { status: 400 })
    }

    if (user.role === "MECHANIC" && !data.userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 })
    }

    // Check if chat already exists between this customer and mechanic/vendor
    // First check for exact match (with requestId/offerId if provided)
    let chat
    if (user.role === "CUSTOMER") {
      // First try to find exact match
      chat = await prisma.autoPartsChat.findFirst({
        where: {
          userId: user.id,
          vendorId: mechanicId, // Using vendorId field for mechanicId (works for both vendors and mechanics)
          ...(requestId && { requestId }),
          ...(offerId && { offerId }),
          isActive: true,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          vendor: {
            select: {
              id: true,
              name: true,
              avatar: true,
              mechanicProfile: {
                select: {
                  businessName: true,
                  logo: true,
                },
              },
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

      // If no exact match, check for any active chat between customer and mechanic (reuse existing)
      if (!chat) {
        chat = await prisma.autoPartsChat.findFirst({
          where: {
            userId: user.id,
            vendorId: mechanicId,
            isActive: true,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
            vendor: {
              select: {
                id: true,
                name: true,
                avatar: true,
                mechanicProfile: {
                  select: {
                    businessName: true,
                    logo: true,
                  },
                },
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
    } else {
      // For mechanics, find chat with customer
      chat = await prisma.autoPartsChat.findFirst({
        where: {
          userId: data.userId,
          vendorId: user.id,
          isActive: true,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          vendor: {
            select: {
              id: true,
              name: true,
              avatar: true,
              mechanicProfile: {
                select: {
                  businessName: true,
                  logo: true,
                },
              },
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

    if (!chat) {
      // Create new chat
      try {
        chat = await prisma.autoPartsChat.create({
          data: {
            userId: user.role === "CUSTOMER" ? user.id : data.userId,
            vendorId: user.role === "CUSTOMER" ? mechanicId : user.id,
            requestId: requestId || null,
            offerId: offerId || null,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
            vendor: {
              select: {
                id: true,
                name: true,
                avatar: true,
                mechanicProfile: {
                  select: {
                    businessName: true,
                    logo: true,
                  },
                },
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
      } catch (createError: any) {
        console.error("Chat creation error details:", createError)
        // If creation fails, try to find existing chat one more time
        if (user.role === "CUSTOMER") {
          chat = await prisma.autoPartsChat.findFirst({
            where: {
              userId: user.id,
              vendorId: mechanicId,
              isActive: true,
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true,
                },
              },
              vendor: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                  mechanicProfile: {
                    select: {
                      businessName: true,
                      logo: true,
                    },
                  },
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
        
        if (!chat) {
          throw createError
        }
      }
    }

    return NextResponse.json({ chat })
  } catch (error: any) {
    console.error("Mechanic chat creation error:", error)
    // Provide more specific error message
    const errorMessage = error.message?.includes("Unique constraint") 
      ? "Chat already exists with this mechanic"
      : error.message || "Failed to create chat"
    return NextResponse.json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    }, { status: 500 })
  }
}

