import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { cloudinary } from "@/lib/cloudinary"
import { buildStatementPdfBuffer } from "@/lib/money-statement-pdf"
import { getCompanyInfoForStatementPdf } from "@/lib/systemSettings"
import { Readable } from "stream"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { filter, startDate, endDate } = await request.json()

    const where: any = {
      OR: [{ senderId: user.id }, { receiverId: user.id }],
    }

    if (filter === "sent") {
      where.OR = [{ senderId: user.id }]
    } else if (filter === "received") {
      where.OR = [{ receiverId: user.id }]
    }

    let periodLabel: string | undefined
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(endDate)
      const s = startDate ? new Date(startDate).toLocaleDateString("en-US") : "…"
      const e = endDate ? new Date(endDate).toLocaleDateString("en-US") : "…"
      periodLabel = `Period: ${s} — ${e}`
    }

    const transfers = await prisma.moneyTransfer.findMany({
      where,
      include: {
        sender: {
          select: { id: true, name: true, email: true, phone: true },
        },
        receiver: {
          select: { id: true, name: true, email: true, phone: true },
        },
        payout: {
          select: { status: true, paystackReference: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const summary = {
      totalSent: transfers.filter((t) => t.senderId === user.id).reduce((sum, t) => sum + t.amount, 0),
      totalReceived: transfers.filter((t) => t.receiverId === user.id).reduce((sum, t) => sum + t.amount, 0),
      totalTransactions: transfers.length,
    }

    const rows = transfers.map((t) => {
      const isSent = t.senderId === user.id
      const other = isSent ? t.receiver : t.sender
      return {
        id: t.id,
        reference: t.reference,
        type: isSent ? ("sent" as const) : ("received" as const),
        amount: t.amount,
        currency: t.currency,
        status: t.status,
        createdAt: t.createdAt,
        otherUser: other,
      }
    })

    const company = await getCompanyInfoForStatementPdf()
    const pdfBuffer = await buildStatementPdfBuffer(user, transfers, filter, summary, {
      periodLabel,
      company,
    })

    const publicId = `statement_${user.id}_${Date.now()}`
    const uploadResult: any = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "money-transfer/statements",
          public_id: publicId,
          resource_type: "raw",
          format: "pdf",
          type: "upload",
        },
        (err, result) => (err ? reject(err) : resolve(result))
      )
      Readable.from(pdfBuffer).pipe(stream)
    })

    const pdfUrl = uploadResult?.secure_url as string

    if (!pdfUrl) {
      return NextResponse.json(
        { error: "Failed to store PDF" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      pdfUrl,
      publicId: uploadResult.public_id,
      data: {
        user: {
          name: user.name,
          email: user.email,
        },
        transactions: rows,
        summary: {
          ...summary,
        },
      },
    })
  } catch (error: any) {
    console.error("Error generating statement:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate statement" },
      { status: 500 }
    )
  }
}
