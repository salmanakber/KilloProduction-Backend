import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = verifyToken(token)
    const userId = decoded.userId

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")
    const status = searchParams.get("status")
    const category = searchParams.get("category")

    const skip = (page - 1) * limit

    const where: any = { userId }

    if (status) {
      where.status = status
    }

    if (category) {
      where.category = category
    }

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ])

    return NextResponse.json({
      tickets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching support tickets:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = verifyToken(token)
    const userId = decoded.userId

    const body = await request.json()
    const { subject, description, category, priority, attachments } = body

    if (!subject || !description || !category) {
      return NextResponse.json({ error: "Subject, description, and category are required" }, { status: 400 })
    }

    // Generate ticket number
    const ticketCount = await prisma.supportTicket.count()
    const ticketNumber = `TK${String(ticketCount + 1).padStart(6, "0")}`

    const ticket = await prisma.supportTicket.create({
      data: {
        userId,
        ticketNumber,
        subject,
        description,
        category,
        priority: priority || "MEDIUM",
        attachments: attachments || [],
        status: "OPEN",
      },
    })

    return NextResponse.json(ticket, { status: 201 })
  } catch (error) {
    console.error("Error creating support ticket:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
