import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

async function resolveId(params: Promise<{ id: string }> | { id: string }) {
  const p = await Promise.resolve(params)
  return p.id
}

async function requireAdmin() {
  const session = await authenticateRequest()
  if (!session?.id) return null
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { role: true },
  })
  if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") return null
  return session
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const admin = await requireAdmin()
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const id = await resolveId(ctx.params)
    const campaign = await prisma.notificationCampaign.findUnique({
      where: { id },
      include: { createdBy: { select: { name: true } } },
    })
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        title: campaign.title,
        message: campaign.message,
        type: campaign.type,
        status: campaign.status,
        targetAudience: {
          userTypes: campaign.targetUserTypes || [],
          modules: campaign.targetModules || [],
          totalUsers: campaign.targetUserCount || 0,
        },
        scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
        sentAt: campaign.sentAt?.toISOString() ?? null,
        imageUrl: campaign.imageUrl,
        actionUrl: campaign.actionUrl,
        metrics: {
          sent: campaign.sentCount || 0,
          delivered: campaign.deliveredCount || 0,
          opened: campaign.openedCount || 0,
          clicked: campaign.clickedCount || 0,
        },
        createdAt: campaign.createdAt.toISOString(),
        createdBy: campaign.createdBy?.name || "Unknown",
      },
    })
  } catch (e) {
    console.error("GET notification campaign:", e)
    return NextResponse.json({ error: "Failed to load" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const admin = await requireAdmin()
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const id = await resolveId(ctx.params)
    const existing = await prisma.notificationCampaign.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (existing.status === "SENT") {
      return NextResponse.json({ error: "Cannot edit a notice that has already been sent" }, { status: 400 })
    }

    const body = await request.json()
    const {
      title,
      message,
      type,
      scheduledAt,
      imageUrl,
      actionUrl,
      targetAudience,
    } = body as Record<string, unknown>

    const ta =
      targetAudience && typeof targetAudience === "object" && targetAudience !== null
        ? (targetAudience as { userTypes?: string[]; modules?: string[] })
        : {}
    const userTypes =
      Array.isArray(ta.userTypes) && ta.userTypes.length > 0 ? ta.userTypes : ["CUSTOMER"]

    let targetUserCount = existing.targetUserCount
    if (targetAudience !== undefined) {
      targetUserCount = await prisma.user.count({
        where: {
          deletedAt: null,
          isActive: true,
          role: { in: userTypes as any },
        },
      })
    }

    let nextScheduled = existing.scheduledAt
    let nextStatus = existing.status
    if (scheduledAt !== undefined) {
      nextScheduled = scheduledAt ? new Date(String(scheduledAt)) : null
      if (nextScheduled && nextScheduled > new Date()) nextStatus = "SCHEDULED"
      else nextStatus = "DRAFT"
    }

    const updated = await prisma.notificationCampaign.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: String(title) }),
        ...(message !== undefined && { message: String(message) }),
        ...(type !== undefined && { type: String(type) }),
        ...(scheduledAt !== undefined && {
          scheduledAt: nextScheduled,
          status: nextStatus,
        }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl ? String(imageUrl) : null }),
        ...(actionUrl !== undefined && { actionUrl: actionUrl ? String(actionUrl) : null }),
        ...(targetAudience !== undefined && {
          targetUserTypes: userTypes,
          targetModules: Array.isArray(ta.modules) ? ta.modules : [],
          targetUserCount,
        }),
      },
    })

    return NextResponse.json({ success: true, campaign: updated })
  } catch (e) {
    console.error("PATCH notification campaign:", e)
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const admin = await requireAdmin()
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const id = await resolveId(ctx.params)
    const existing = await prisma.notificationCampaign.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (existing.status === "SENT") {
      return NextResponse.json({ error: "Cannot delete a notice that has already been sent" }, { status: 400 })
    }

    await prisma.notificationCampaign.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("DELETE notification campaign:", e)
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
