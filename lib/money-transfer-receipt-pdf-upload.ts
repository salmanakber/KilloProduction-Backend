import { cloudinary } from "@/lib/cloudinary"
import { Readable } from "stream"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { buildTransferReceiptPdfBuffer } from "@/lib/money-transfer-receipt-pdf"
import { getCompanyInfoForStatementPdf } from "@/lib/systemSettings"

export async function ensureTransferReceiptPdfUrl(args: {
  transfer: {
    id: string
    reference: string
    amount: number
    currency: string
    status: string
    description?: string | null
    createdAt: Date
    receiveAmount?: number | null
    receiveCurrency?: string | null
    senderId: string
    receiverId: string
    metadata?: unknown
  }
  user: { id: string; name: string | null; email: string | null; phone?: string | null }
  sender: { name: string | null; email?: string | null }
  receiver: { name: string | null; email?: string | null }
}): Promise<string> {
  const meta = (args.transfer.metadata as Record<string, unknown>) || {}
  if (typeof meta.receiptPdfUrl === "string" && meta.receiptPdfUrl) {
    return meta.receiptPdfUrl
  }

  const isSender = args.transfer.senderId === args.user.id
  const otherParty = isSender ? args.receiver : args.sender
  const company = await getCompanyInfoForStatementPdf()

  const pdfBuffer = await buildTransferReceiptPdfBuffer({
    transfer: args.transfer,
    accountHolder: args.user,
    otherParty,
    direction: isSender ? "sent" : "received",
    company,
  })

  const publicId = `receipt_${args.transfer.id}_${Date.now()}`
  const uploadResult: { secure_url?: string } = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "money-transfer/receipts-pdf",
        public_id: publicId,
        resource_type: "raw",
        format: "pdf",
        type: "upload",
      },
      (err, result) => (err ? reject(err) : resolve(result || {})),
    )
    Readable.from(pdfBuffer).pipe(stream)
  })

  const pdfUrl = uploadResult.secure_url
  if (!pdfUrl) throw new Error("Failed to upload receipt PDF")

  await prisma.moneyTransfer.update({
    where: { id: args.transfer.id },
    data: {
      metadata: {
        ...meta,
        receiptPdfUrl: pdfUrl,
      } as Prisma.InputJsonValue,
    },
  })

  return pdfUrl
}
