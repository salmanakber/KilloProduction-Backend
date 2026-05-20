import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  logMoneyTransferAdminAction,
  MONEY_TRANSFER_CASE_ENTITY,
  MoneyAdminAuthError,
  requireMoneyTransferAdmin,
} from "@/lib/money-transfer-admin"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user, meta } = await requireMoneyTransferAdmin(request)
    const { message, isInternal = true } = await request.json()

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    const caseRow = await prisma.moneyTransferCase.findUnique({ where: { id: params.id } })
    if (!caseRow) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 })
    }

    const note = await prisma.moneyTransferCaseNote.create({
      data: {
        caseId: params.id,
        authorId: user.id,
        message: String(message).trim(),
        isInternal: Boolean(isInternal),
      },
      include: { author: { select: { id: true, name: true, email: true } } },
    })

    await prisma.moneyTransferCase.update({
      where: { id: params.id },
      data: { updatedAt: new Date() },
    })

    await logMoneyTransferAdminAction({
      performedBy: user.id,
      action: "MONEY_TRANSFER_CASE_NOTE",
      entityType: MONEY_TRANSFER_CASE_ENTITY,
      entityId: params.id,
      details: { noteId: note.id, isInternal },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({ success: true, note })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to add note" }, { status: 500 })
  }
}
