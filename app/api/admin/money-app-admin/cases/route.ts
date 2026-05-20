import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  generateMoneyCaseTicketNumber,
  logMoneyTransferAdminAction,
  MONEY_TRANSFER_CASE_ENTITY,
  MoneyAdminAuthError,
  requireMoneyTransferAdmin,
} from "@/lib/money-transfer-admin"
import type { MoneyTransferCaseType, TicketPriority, TicketStatus } from "@prisma/client"

export async function GET(request: NextRequest) {
  try {
    await requireMoneyTransferAdmin(request)
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const type = searchParams.get("type")
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50", 10))
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    const where: Record<string, unknown> = {}
    if (status) where.status = status as TicketStatus
    if (type) where.type = type as MoneyTransferCaseType

    const [cases, total] = await Promise.all([
      prisma.moneyTransferCase.findMany({
        where,
        include: {
          transfer: { select: { id: true, reference: true, status: true, amount: true, currency: true } },
          openedBy: { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
          requester: { select: { id: true, name: true, email: true } },
          _count: { select: { notes: true } },
        },
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.moneyTransferCase.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      cases,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load cases" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, meta } = await requireMoneyTransferAdmin(request)
    const body = await request.json()
    const {
      transferId,
      type = "OTHER",
      priority = "MEDIUM",
      subject,
      description,
      requesterId,
    } = body

    if (!subject?.trim() || !description?.trim()) {
      return NextResponse.json({ error: "Subject and description are required" }, { status: 400 })
    }

    if (transferId) {
      const transfer = await prisma.moneyTransfer.findUnique({ where: { id: transferId } })
      if (!transfer) {
        return NextResponse.json({ error: "Transfer not found" }, { status: 404 })
      }
    }

    const created = await prisma.moneyTransferCase.create({
      data: {
        ticketNumber: generateMoneyCaseTicketNumber(),
        transferId: transferId || null,
        type,
        priority,
        subject: String(subject).trim(),
        description: String(description).trim(),
        openedById: user.id,
        requesterId: requesterId || null,
      },
      include: {
        transfer: { select: { reference: true, status: true } },
      },
    })

    await logMoneyTransferAdminAction({
      performedBy: user.id,
      action: "MONEY_TRANSFER_CASE_CREATE",
      entityType: MONEY_TRANSFER_CASE_ENTITY,
      entityId: created.id,
      details: { ticketNumber: created.ticketNumber, type, transferId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({ success: true, case: created })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create case" },
      { status: 500 },
    )
  }
}
