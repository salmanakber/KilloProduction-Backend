import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { MoneyScheduleFrequency } from "@prisma/client"

function parseFrequency(v: string | null): MoneyScheduleFrequency | null {
  if (!v) return null
  const u = v.toUpperCase()
  if (u === "ONCE" || u === "ONE-TIME" || u === "ONE_TIME") return "ONCE"
  if (u === "DAILY") return "DAILY"
  if (u === "WEEKLY") return "WEEKLY"
  if (u === "MONTHLY") return "MONTHLY"
  return null
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rows = await prisma.moneyScheduledTransfer.findMany({
      where: { userId: user.id },
      orderBy: { nextRunAt: "asc" },
      include: {
        receiver: {
          select: { id: true, name: true, email: true, phone: true, avatar: true },
        },
      },
    })

    const schedules = rows.map((s) => ({
      id: s.id,
      receiver: {
        id: s.receiver.id,
        name: s.receiver.name || s.receiver.email || s.receiver.phone || "Recipient",
        avatar: s.receiver.avatar || undefined,
      },
      amount: s.amount,
      currency: s.currency,
      frequency: s.frequency,
      nextRunDate: s.nextRunAt.toISOString(),
      status: s.status,
      description: s.description,
    }))

    return NextResponse.json({ success: true, schedules })
  } catch (e: any) {
    console.error("scheduled-transfers GET:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const receiverId = body.receiverId as string
    const amount = Number(body.amount)
    const currency = (body.currency as string) || "USD"
    const frequency = parseFrequency(body.frequency as string)
    const nextRunAtRaw = body.nextRunAt as string | undefined
    const description = (body.description as string) || null

    if (!receiverId || !Number.isFinite(amount) || amount <= 0 || !frequency) {
      return NextResponse.json({ error: "Invalid receiver, amount, or frequency" }, { status: 400 })
    }

    if (receiverId === user.id) {
      return NextResponse.json({ error: "Cannot schedule transfer to yourself" }, { status: 400 })
    }

    const receiver = await prisma.user.findUnique({ where: { id: receiverId } })
    if (!receiver) {
      return NextResponse.json({ error: "Recipient not found" }, { status: 404 })
    }

    let nextRunAt = nextRunAtRaw ? new Date(nextRunAtRaw) : new Date(Date.now() + 24 * 60 * 60 * 1000)
    if (Number.isNaN(nextRunAt.getTime())) {
      return NextResponse.json({ error: "Invalid nextRunAt" }, { status: 400 })
    }

    const created = await prisma.moneyScheduledTransfer.create({
      data: {
        userId: user.id,
        receiverId,
        amount,
        currency,
        frequency,
        nextRunAt,
        status: "ACTIVE",
        description,
      },
      include: {
        receiver: {
          select: { id: true, name: true, email: true, phone: true, avatar: true },
        },
      },
    })

    return NextResponse.json({
      success: true,
      schedule: {
        id: created.id,
        receiver: {
          id: created.receiver.id,
          name: created.receiver.name || created.receiver.email || "Recipient",
          avatar: created.receiver.avatar || undefined,
        },
        amount: created.amount,
        currency: created.currency,
        frequency: created.frequency,
        nextRunDate: created.nextRunAt.toISOString(),
        status: created.status,
      },
    })
  } catch (e: any) {
    console.error("scheduled-transfers POST:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
