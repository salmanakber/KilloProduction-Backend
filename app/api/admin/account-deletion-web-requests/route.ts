import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/** Admin list of public web deletion requests. */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || undefined
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)))

    const requests = await prisma.accountDeletionWebRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    return NextResponse.json({ success: true, requests })
  } catch (error) {
    console.error("List web deletion requests failed:", error)
    return NextResponse.json({ error: "Failed to load requests" }, { status: 500 })
  }
}

/** Mark a web deletion request processed / rejected (and optionally schedule app deletion). */
export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const id = String(body.id || "")
    const status = String(body.status || "").toUpperCase()
    const adminNote = typeof body.adminNote === "string" ? body.adminNote.slice(0, 1000) : undefined
    const scheduleDeletion = body.scheduleDeletion === true

    if (!id || !["PROCESSED", "REJECTED", "PENDING"].includes(status)) {
      return NextResponse.json({ error: "id and status (PROCESSED|REJECTED|PENDING) required" }, { status: 400 })
    }

    const existing = await prisma.accountDeletionWebRequest.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 })
    }

    if (scheduleDeletion && existing.matchedUserId && status === "PROCESSED") {
      const now = new Date()
      await prisma.user.update({
        where: { id: existing.matchedUserId },
        data: {
          isActive: false,
          status: "INACTIVE",
          deletedAt: now,
        },
      })
      await prisma.auditLog.create({
        data: {
          performedBy: user.id,
          action: "ACCOUNT_DELETE_REQUESTED",
          entityType: "User",
          entityId: existing.matchedUserId,
          details: {
            source: "admin_from_web_request",
            webRequestId: existing.id,
            requestedAt: now.toISOString(),
          },
        },
      })
    }

    const updated = await prisma.accountDeletionWebRequest.update({
      where: { id },
      data: {
        status,
        adminNote,
        processedAt: status === "PENDING" ? null : new Date(),
        processedById: status === "PENDING" ? null : user.id,
      },
    })

    return NextResponse.json({ success: true, request: updated })
  } catch (error) {
    console.error("Update web deletion request failed:", error)
    return NextResponse.json({ error: "Failed to update request" }, { status: 500 })
  }
}
