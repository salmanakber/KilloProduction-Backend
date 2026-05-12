import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const RETENTION_DAYS = 30

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { deletedAt: true, isActive: true },
    })

    if (!user?.deletedAt) {
      return NextResponse.json({ scheduled: false })
    }

    const requestedAt = new Date(user.deletedAt)
    const purgeAt = new Date(requestedAt.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000)

    return NextResponse.json({
      scheduled: true,
      isActive: user.isActive,
      requestedAt: requestedAt.toISOString(),
      purgeAt: purgeAt.toISOString(),
      retentionDays: RETENTION_DAYS,
    })
  } catch (error) {
    console.error("Error fetching account deletion status:", error)
    return NextResponse.json({ error: "Failed to fetch deletion status" }, { status: 500 })
  }
}
