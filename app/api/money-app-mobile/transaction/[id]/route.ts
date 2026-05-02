import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const transfer = await prisma.moneyTransfer.findUnique({
      where: { id: params.id },
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
            paystackTransferCode: true,
            paystackReference: true,
            paystackResponse: true,
            failureReason: true,
            createdAt: true,
            processedAt: true,
            completedAt: true,
            failedAt: true,
          },
        },
      },
    })

    if (!transfer) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      )
    }

    // Verify user has access to this transaction
    if (transfer.senderId !== user.id && transfer.receiverId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized access to this transaction" },
        { status: 403 }
      )
    }

    const isSender = transfer.senderId === user.id
    const otherUser = isSender ? transfer.receiver : transfer.sender

    return NextResponse.json({
      success: true,
      transfer: {
        id: transfer.id,
        reference: transfer.reference,
        type: isSender ? "sent" : "received",
        amount: transfer.amount,
        currency: transfer.currency,
        ngnAmount: transfer.ngnAmount,
        status: transfer.status,
        description: transfer.description,
        otherUser: {
          id: otherUser.id,
          name: otherUser.name || otherUser.email || otherUser.phone,
          email: otherUser.email,
          phone: otherUser.phone,
          avatar: otherUser.avatar,
        },
        payout: transfer.payout,
        metadata: transfer.metadata,
        receiptImageUrl: transfer.receiptImageUrl,
        createdAt: transfer.createdAt,
        updatedAt: transfer.updatedAt,
        sentAt: transfer.sentAt,
        completedAt: transfer.completedAt,
        failedAt: transfer.failedAt,
      },
    })
  } catch (error: any) {
    console.error("Error fetching transaction:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch transaction" },
      { status: 500 }
    )
  }
}
