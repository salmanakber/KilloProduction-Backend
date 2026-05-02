import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { executeAdminNotificationCampaignSend } from "@/lib/execute-admin-notification-campaign"

async function resolveId(params: Promise<{ id: string }> | { id: string }) {
  const p = await Promise.resolve(params)
  return p.id
}

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await authenticateRequest()
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { role: true },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const id = await resolveId(ctx.params)
    const result = await executeAdminNotificationCampaignSend(id)

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Send failed", delivered: result.delivered },
        { status: result.error === "Campaign not found" ? 404 : 400 }
      )
    }

    return NextResponse.json({ success: true, delivered: result.delivered })
  } catch (e) {
    console.error("notification campaign send:", e)
    return NextResponse.json({ error: "Send failed" }, { status: 500 })
  }
}
