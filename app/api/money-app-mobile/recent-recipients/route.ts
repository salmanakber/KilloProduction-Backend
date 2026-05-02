import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "12", 10) || 12, 30)

    const recent = await prisma.moneyTransfer.findMany({
      where: {
        senderId: user.id,
        status: { in: ["COMPLETED", "SENT", "PROCESSING", "PENDING"] },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatar: true,
          },
        },
      },
    })

    const seen = new Set<string>()
    const users: {
      id: string
      name: string
      email: string
      phone: string
      avatar?: string
    }[] = []

    for (const t of recent) {
      if (seen.has(t.receiverId)) continue
      seen.add(t.receiverId)
      const r = t.receiver
      users.push({
        id: r.id,
        name: r.name || r.email || r.phone || "User",
        email: r.email || "",
        phone: r.phone || "",
        avatar: r.avatar || undefined,
      })
      if (users.length >= limit) break
    }

    return NextResponse.json({ success: true, users })
  } catch (e: any) {
    console.error("recent-recipients:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
