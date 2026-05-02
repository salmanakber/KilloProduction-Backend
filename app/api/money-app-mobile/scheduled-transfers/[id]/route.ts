import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { MoneyScheduleStatus } from "@prisma/client"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const row = await prisma.moneyScheduledTransfer.findFirst({
      where: { id: params.id, userId: user.id },
    })
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const body = await request.json()
    const status = body.status as string | undefined

    let nextStatus: MoneyScheduleStatus | undefined
    if (status === "ACTIVE") nextStatus = "ACTIVE"
    else if (status === "PAUSED") nextStatus = "PAUSED"
    else if (status === "CANCELLED") nextStatus = "CANCELLED"

    const updated = await prisma.moneyScheduledTransfer.update({
      where: { id: row.id },
      data: {
        ...(nextStatus ? { status: nextStatus } : {}),
      },
    })

    return NextResponse.json({
      success: true,
      schedule: {
        id: updated.id,
        status: updated.status,
        nextRunDate: updated.nextRunAt.toISOString(),
      },
    })
  } catch (e: any) {
    console.error("scheduled-transfers PATCH:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const row = await prisma.moneyScheduledTransfer.findFirst({
      where: { id: params.id, userId: user.id },
    })
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    await prisma.moneyScheduledTransfer.delete({ where: { id: row.id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("scheduled-transfers DELETE:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
