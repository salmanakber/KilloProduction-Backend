import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MoneyAdminAuthError, requireMoneyTransferAdmin } from "@/lib/money-transfer-admin"
import { serializeAjoGroup } from "@/lib/ajo-service"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireMoneyTransferAdmin(request)

    const group = await prisma.ajoGroup.findUnique({
      where: { id: params.id },
      include: {
        creator: { select: { id: true, name: true, avatar: true, email: true, phone: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, avatar: true, phone: true, email: true } },
          },
          orderBy: { slotPosition: "asc" },
        },
        cycles: {
          orderBy: { cycleNumber: "asc" },
          include: {
            contributions: true,
            recipient: { select: { id: true, name: true, avatar: true } },
            payout: true,
          },
        },
      },
    })

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      group: serializeAjoGroup(group),
    })
  } catch (error: unknown) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("admin ajo/groups/[id] GET:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
