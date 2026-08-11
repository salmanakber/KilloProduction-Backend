import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  ACCOUNT_DELETION_RETENTION_DAYS,
  getAccountDeletionSupportEmail,
} from "@/lib/account-deletion-policy"
import { sendEmail } from "@/lib/email"

function normalizePhone(raw: string) {
  return raw.replace(/[^\d+]/g, "").trim()
}

/**
 * Public web account-deletion request (no login).
 * Play Store / App Store require a URL where users can request deletion outside the app.
 * POST /api/account-deletion/request
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
    const phoneRaw = typeof body.phone === "string" ? body.phone.trim() : ""
    const phone = phoneRaw ? normalizePhone(phoneRaw) : ""
    const fullName = typeof body.fullName === "string" ? body.fullName.trim().slice(0, 120) : ""
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : ""
    const confirm = body.confirm === true || body.confirm === "true"

    if (!email && !phone) {
      return NextResponse.json(
        { error: "Email or phone number is required." },
        { status: 400 },
      )
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
    }
    if (!confirm) {
      return NextResponse.json(
        { error: "Please confirm that you want to request account deletion." },
        { status: 400 },
      )
    }

    // Rate-limit-ish: reject duplicate pending requests for same identity in last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const existingPending = await prisma.accountDeletionWebRequest.findFirst({
      where: {
        status: "PENDING",
        createdAt: { gte: since },
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
    })
    if (existingPending) {
      return NextResponse.json({
        success: true,
        alreadySubmitted: true,
        reference: existingPending.id,
        message:
          "A deletion request with these details was already received. Our team will process it shortly.",
        retentionDays: ACCOUNT_DELETION_RETENTION_DAYS,
      })
    }

    let matchedUserId: string | null = null
    if (email || phone) {
      const user = await prisma.user.findFirst({
        where: {
          role: "CUSTOMER",
          OR: [
            ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
            ...(phone
              ? [
                  { phone },
                  { phone: phoneRaw },
                  ...(phone.startsWith("+") ? [{ phone: phone.slice(1) }] : [{ phone: `+${phone}` }]),
                ]
              : []),
          ],
        },
        select: { id: true },
      })
      matchedUserId = user?.id ?? null
    }

    const webRequest = await prisma.accountDeletionWebRequest.create({
      data: {
        email: email || null,
        phone: phone || phoneRaw || null,
        fullName: fullName || null,
        reason: reason || null,
        matchedUserId,
        status: "PENDING",
        source: "PLAY_STORE_WEB",
        userAgent: request.headers.get("user-agent")?.slice(0, 500) || null,
        ipAddress:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          request.headers.get("x-real-ip") ||
          null,
      },
    })

    // Audit trail only when we have a real user FK
    if (matchedUserId) {
      await prisma.auditLog
        .create({
          data: {
            performedBy: matchedUserId,
            action: "ACCOUNT_DELETE_WEB_REQUESTED",
            entityType: "User",
            entityId: matchedUserId,
            details: {
              source: "web_public_form",
              webRequestId: webRequest.id,
              email: email || null,
              phone: phone || phoneRaw || null,
              fullName: fullName || null,
              reason: reason || null,
              retentionDays: ACCOUNT_DELETION_RETENTION_DAYS,
            },
          },
        })
        .catch(() => {})
    }

    // Notify support (best-effort)
    const support = getAccountDeletionSupportEmail()
    try {
      await sendEmail(support, "genericNotification", {
        title: "New web account deletion request",
        message: `A public deletion request was submitted.<br/><br/>Reference: <code>${webRequest.id}</code><br/>Email: ${email || "—"}<br/>Phone: ${phone || phoneRaw || "—"}<br/>Name: ${fullName || "—"}<br/>Matched user: ${matchedUserId || "none"}<br/>Reason: ${reason || "—"}<br/><br/>Review in Admin → Account Deletion Logs.`,
        email: support,
        adminContact: support,
      })
    } catch {
      /* ignore mail failures */
    }

    return NextResponse.json({
      success: true,
      reference: webRequest.id,
      id: webRequest.id,
      message: `Your account deletion request has been submitted. If an account matches, it will be processed and personal data purged within approximately ${ACCOUNT_DELETION_RETENTION_DAYS} days after verification.`,
      retentionDays: ACCOUNT_DELETION_RETENTION_DAYS,
    })
  } catch (error) {
    console.error("Public account deletion request failed:", error)
    return NextResponse.json(
      { error: "Failed to submit deletion request. Please try again or contact support." },
      { status: 500 },
    )
  }
}
