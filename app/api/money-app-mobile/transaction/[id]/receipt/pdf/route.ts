import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ensureTransferReceiptPdfUrl } from "@/lib/money-transfer-receipt-pdf-upload"

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await authenticateRequest(_request)
    console.log("user", user)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const transfer = await prisma.moneyTransfer.findUnique({
      where: { id: params.id },
      include: {
        sender: { select: { name: true, email: true } },
        receiver: { select: { name: true, email: true } },
      },
    })

    if (!transfer) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }
    if (transfer.senderId !== user.id && transfer.receiverId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const pdfUrl = await ensureTransferReceiptPdfUrl({
      transfer,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
      sender: transfer.sender,
      receiver: transfer.receiver,
    })

    return NextResponse.json({
      success: true,
      pdfUrl,
      reference: transfer.reference,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to generate PDF"
    console.error("receipt/pdf:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
