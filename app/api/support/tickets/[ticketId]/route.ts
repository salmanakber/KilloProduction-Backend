import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: { ticketId: string } }) {
  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.id
    const { ticketId } = params

    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id: ticketId,
        userId, // Ensure user can only access their own tickets
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          }
        },
        replies: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                role: true,
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      },
    })

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    }

    return NextResponse.json({ ticket })
  } catch (error) {
    console.error("Error fetching support ticket:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { ticketId: string } }) {
  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.id
    const { ticketId } = params

    const body = await request.json()
    const { status, resolution } = body

    // Verify ticket belongs to user
    const existingTicket = await prisma.supportTicket.findFirst({
      where: {
        id: ticketId,
        userId,
      },
    })

    if (!existingTicket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    }

    const ticket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        ...(status && { status }),
        ...(resolution && { resolution }),
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({ ticket })
  } catch (error) {
    console.error("Error updating support ticket:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
