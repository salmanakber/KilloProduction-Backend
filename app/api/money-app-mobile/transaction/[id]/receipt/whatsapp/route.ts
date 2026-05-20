import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ensureTransferReceiptPdfUrl } from "@/lib/money-transfer-receipt-pdf-upload"
import { sendMoneyReceiptWithSmartDelivery } from "@/lib/money-whatsapp"
import { isMoneyReceiptDeliveryAvailable } from "@/lib/money-receipt-whatsapp-config"

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await authenticateRequest(_request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wa = await isMoneyReceiptDeliveryAvailable()

    if (!wa) {
      return NextResponse.json(
        {
          error: "WhatsApp receipts are not configured",
          message:
            "Enable receipt delivery in Admin → System Settings (Notifications) and add Meta Cloud API and/or Twilio.",
        },
        { status: 503 },
      )
    }

    const phone = user.phone?.trim()
    
    if (!phone) {
      return NextResponse.json(
        {
          error: "No phone on your profile",
          message: "Add your mobile number in profile settings to receive receipts on WhatsApp.",
          requiresPhone: true,
        },
        { status: 400 },
      )
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

    const result = await sendMoneyReceiptWithSmartDelivery({
      toPhone: phone,
      pdfUrl,
      reference: transfer.reference,
      amount: transfer.amount,
      currency: transfer.currency,
      customerName: user.name || undefined,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "WhatsApp delivery failed" },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      message: "Receipt sent",
      messageId: result.messageId,
      mode: result.mode,
      deliveryNote: result.deliveryNote,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to send WhatsApp receipt"
    console.error("receipt/whatsapp:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
