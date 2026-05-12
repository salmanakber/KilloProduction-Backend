import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const RETENTION_DAYS = 30

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || "").toLowerCase()

    if (!["deactivate", "delete", "cancel_delete"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, email: true, name: true, role: true },
    })
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (action === "deactivate") {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isActive: false,
          status: "INACTIVE",
        },
      })

      await prisma.auditLog.create({
        data: {
          performedBy: user.id,
          action: "ACCOUNT_DEACTIVATION_REQUESTED",
          entityType: "User",
          entityId: user.id,
          details: {
            source: "mobile",
            retentionDays: RETENTION_DAYS,
          },
        },
      })

      return NextResponse.json({
        success: true,
        message: "Account deactivated successfully.",
      })
    }

    if (action === "cancel_delete") {
      const existing = await prisma.user.findUnique({
        where: { id: user.id },
        select: { deletedAt: true },
      })

      if (!existing?.deletedAt) {
        return NextResponse.json({
          success: true,
          message: "No scheduled account deletion found.",
          cancelled: false,
        })
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          deletedAt: null,
          isActive: true,
          status: "ACTIVE",
        },
      })

      await prisma.auditLog.create({
        data: {
          performedBy: user.id,
          action: "ACCOUNT_DELETE_CANCELLED",
          entityType: "User",
          entityId: user.id,
          details: {
            source: "mobile",
            cancelledAt: new Date().toISOString(),
          },
        },
      })

      return NextResponse.json({
        success: true,
        cancelled: true,
        message: "Scheduled account deletion has been cancelled.",
      })
    }

    const now = new Date()
    const purgeAfter = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000)

    await prisma.user.update({
      where: { id: user.id },
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
        entityId: user.id,
        details: {
          source: "mobile",
          requestedAt: now.toISOString(),
          scheduledPurgeAt: purgeAfter.toISOString(),
          retentionDays: RETENTION_DAYS,
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: `Account deletion scheduled. Your data will be securely purged after ${RETENTION_DAYS} days.`,
      scheduledPurgeAt: purgeAfter.toISOString(),
    })
  } catch (error) {
    console.error("Error handling customer account delete/deactivate:", error)
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 })
  }
}
