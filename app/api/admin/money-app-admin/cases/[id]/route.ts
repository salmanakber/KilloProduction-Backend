import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  logMoneyTransferAdminAction,
  MONEY_TRANSFER_CASE_ENTITY,
  MoneyAdminAuthError,
  requireMoneyTransferAdmin,
} from "@/lib/money-transfer-admin"
import type { TicketPriority, TicketStatus } from "@prisma/client"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireMoneyTransferAdmin(request)
    const item = await prisma.moneyTransferCase.findUnique({
      where: { id: params.id },
      include: {
        transfer: {
          include: {
            sender: { select: { id: true, name: true, email: true } },
            receiver: { select: { id: true, name: true, email: true } },
            payout: true,
          },
        },
        openedBy: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        requester: { select: { id: true, name: true, email: true } },
        notes: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, email: true } } },
        },
      },
    })
    if (!item) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true, case: item })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to load case" }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user, meta } = await requireMoneyTransferAdmin(request)
    const body = await request.json()
    const { status, priority, assignedToId, resolution } = body

    const existing = await prisma.moneyTransferCase.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 })
    }

    const data: {
      status?: TicketStatus
      priority?: TicketPriority
      assignedToId?: string | null
      resolution?: string | null
      resolvedAt?: Date | null
    } = {}

    if (status) {
      data.status = status
      if (status === "RESOLVED" || status === "CLOSED") {
        data.resolvedAt = new Date()
      }
    }
    if (priority) data.priority = priority
    if (assignedToId !== undefined) data.assignedToId = assignedToId || null
    if (resolution !== undefined) data.resolution = resolution

    const updated = await prisma.moneyTransferCase.update({
      where: { id: params.id },
      data,
    })

    await logMoneyTransferAdminAction({
      performedBy: user.id,
      action: "MONEY_TRANSFER_CASE_UPDATE",
      entityType: MONEY_TRANSFER_CASE_ENTITY,
      entityId: updated.id,
      details: { changes: body, ticketNumber: updated.ticketNumber },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({ success: true, case: updated })
  } catch (error) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to update case" }, { status: 500 })
  }
}
