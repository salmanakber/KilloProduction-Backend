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

    const walletWhere: {
      userId: string
      createdAt?: { gte?: Date; lte?: Date }
      type?: { in: ("DEBIT" | "WITHDRAWAL" | "CREDIT")[] }
    } = { userId: user.id }

    if (filter === "sent") {
      walletWhere.type = { in: ["DEBIT", "WITHDRAWAL"] }
    } else if (filter === "received") {
      walletWhere.type = { in: ["CREDIT"] }
    }

    if (startDate || endDate) {
      walletWhere.createdAt = {}
      if (startDate) walletWhere.createdAt.gte = new Date(startDate)
      if (endDate) walletWhere.createdAt.lte = new Date(endDate)
    }

    const walletTransactions = await prisma.moneyTransferWalletTransaction.findMany({
      where: walletWhere,
      orderBy: { createdAt: "desc" },
    })

    const walletStatementRows = walletTransactions.map((w) => {
      const isDebit = w.type === "DEBIT" || w.type === "WITHDRAWAL"
      return {
        id: `wallet-${w.id}`,
        reference: w.reference || w.id,
        createdAt: w.createdAt,
        amount: w.amount,
        currency: w.currency,
        status: "COMPLETED",
        senderId: isDebit ? user.id : "wallet-system",
        receiverId: isDebit ? "wallet-system" : user.id,
        sender: isDebit
          ? { id: user.id, name: user.name, email: user.email, phone: user.phone }
          : { id: "wallet-system", name: w.description, email: null, phone: null },
        receiver: isDebit
          ? { id: "wallet-system", name: w.description, email: null, phone: null }
          : { id: user.id, name: user.name, email: user.email, phone: user.phone },
        walletActivity: true,
        walletDescription: w.description,
      }
    })

    const transferSent = transfers
      .filter((t) => t.senderId === user.id)
      .reduce((sum, t) => sum + t.amount, 0)
    const transferReceived = transfers
      .filter((t) => t.receiverId === user.id)
      .reduce((sum, t) => sum + t.amount, 0)
    const walletSent = walletTransactions
      .filter((w) => w.type === "DEBIT" || w.type === "WITHDRAWAL")
      .reduce((sum, w) => sum + w.amount, 0)
    const walletReceived = walletTransactions
      .filter((w) => w.type === "CREDIT")
      .reduce((sum, w) => sum + w.amount, 0)

    const summary = {
      totalSent: transferSent + walletSent,
      totalReceived: transferReceived + walletReceived,
      totalTransactions: transfers.length + walletTransactions.length,
    }

    const statementRows = [...transfers, ...walletStatementRows].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )

    const rows = statementRows.map((t) => {
      const isWallet = Boolean((t as { walletActivity?: boolean }).walletActivity)
      if (isWallet) {
        const w = t as typeof walletStatementRows[number]
        const isSent = w.senderId === user.id
        return {
          id: w.id,
          reference: w.reference,
          type: isSent ? ("sent" as const) : ("received" as const),
          amount: w.amount,
          currency: w.currency,
          status: w.status,
          createdAt: w.createdAt,
          otherUser: { name: w.walletDescription || "Wallet activity" },
          activityKind: "wallet" as const,
          description: w.walletDescription,
        }
      }
      const tr = t as typeof transfers[number]
      const isSent = tr.senderId === user.id
      const other = isSent ? tr.receiver : tr.sender
      return {
        id: tr.id,
        reference: tr.reference,
        type: isSent ? ("sent" as const) : ("received" as const),
        amount: tr.amount,
        currency: tr.currency,
        status: tr.status,
        createdAt: tr.createdAt,
        otherUser: other,
        activityKind: "transfer" as const,
      }
    })

    const company = await getCompanyInfoForStatementPdf()
    const pdfBuffer = await buildStatementPdfBuffer(user, statementRows, filter, summary, {
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
