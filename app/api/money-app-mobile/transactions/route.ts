import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type") // "sent" | "received" | "all"
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    const where: any = {
      OR: [
        { senderId: user.id },
        { receiverId: user.id },
      ],
    }

    if (type === "sent") {
      where.OR = [{ senderId: user.id }]
    } else if (type === "received") {
      where.OR = [{ receiverId: user.id }]
    }

    const [transfers, total] = await Promise.all([
      prisma.moneyTransfer.findMany({
        where,
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              avatar: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              avatar: true,
            },
          },
          payout: {
            select: {
              id: true,
              status: true,
              paystackReference: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.moneyTransfer.count({ where }),
    ])

    const formattedTransfers = transfers.map((transfer) => {
      const isSender = transfer.senderId === user.id
      const otherUser = isSender ? transfer.receiver : transfer.sender

      return {
        id: transfer.id,
        reference: transfer.reference,
        type: isSender ? "sent" : "received",
        amount: transfer.amount,
        currency: transfer.currency,
        status: transfer.status,
        otherUser: {
          id: otherUser.id,
          name: otherUser.name || otherUser.email || otherUser.phone,
          avatar: otherUser.avatar,
        },
        description: transfer.description,
        createdAt: transfer.createdAt,
        completedAt: transfer.completedAt,
        payoutStatus: transfer.payout?.status,
      }
    })

    return NextResponse.json({
      success: true,
      transfers: formattedTransfers,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    })
  } catch (error: any) {
    console.error("Error fetching transactions:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch transactions" },
      { status: 500 }
    )
  }
}
