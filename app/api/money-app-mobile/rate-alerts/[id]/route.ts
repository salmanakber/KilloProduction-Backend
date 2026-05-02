import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const row = await prisma.moneyRateAlert.findFirst({
      where: { id: params.id, userId: user.id },
    })
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const body = await request.json()
    const status = body.status as string | undefined
    let next = row.status
    if (status === "ACTIVE" || status === "PAUSED") next = status

    const updated = await prisma.moneyRateAlert.update({
      where: { id: row.id },
      data: { status: next },
    })

    return NextResponse.json({ success: true, alert: { id: updated.id, status: updated.status } })
  } catch (e: any) {
    console.error("rate-alerts PATCH:", e)
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

    const row = await prisma.moneyRateAlert.findFirst({
      where: { id: params.id, userId: user.id },
    })
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    await prisma.moneyRateAlert.delete({ where: { id: row.id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("rate-alerts DELETE:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
