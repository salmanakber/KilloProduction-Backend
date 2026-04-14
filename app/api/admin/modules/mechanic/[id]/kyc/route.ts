import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
import { sendEmailFromTemplate } from "@/lib/email"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await authenticateRequest(request)
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminUser = await prisma.user.findUnique({ where: { id: session.id } })
    if (adminUser?.role !== "ADMIN" && adminUser?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { action, reason, rejectedFields } = await request.json()

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    if (action === "reject" && !reason?.trim()) {
      return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 })
    }

    const profile = await prisma.mechanicProfile.findUnique({
      where: { id: params.id },
      include: {
        user: {
          include: {
            userSettings: true,
          },
        },
      },
    })

    if (!profile) {
      return NextResponse.json({ error: "Mechanic profile not found" }, { status: 404 })
    }

    const isVerified = action === "approve"

    await prisma.mechanicProfile.update({
      where: { id: params.id },
      data: {
        isVerified,
        isActive: isVerified ? true : profile.isActive,
      },
    })

    if (action === "approve") {
      await prisma.user.update({
        where: { id: profile.userId },
        data: {
          isActive: true,
          isVerified: true,
          status: "ACTIVE",
        },
      })

      const defaultCurrency = await prisma.currency.findFirst({
        where: { isDefault: true },
        select: { code: true },
      })
      const currencyCode = defaultCurrency?.code || process.env.DEFAULT_CURRENCY || "NGN"
      const ownerName = profile.user?.name || profile.businessName || "Mechanic"

      await prisma.wallet.upsert({
        where: { userId: profile.userId },
        update: { currency: currencyCode },
        create: { userId: profile.userId, balance: 0, currency: currencyCode },
      })

      const [firstName, ...rest] = ownerName.trim().split(/\s+/)
      const lastName = rest.join(" ")

      await prisma.userProfile.upsert({
        where: { userId: profile.userId },
        update: { firstName: firstName || null, lastName: lastName || null },
        create: { userId: profile.userId, firstName: firstName || null, lastName: lastName || null },
      })
    }

    if (action === "reject") {
      await prisma.kycRejection.create({
        data: {
          entityType: "MECHANIC",
          entityId: params.id,
          userId: profile.userId,
          rejectionReason: reason,
          rejectedFields: rejectedFields && Array.isArray(rejectedFields) ? rejectedFields : undefined,
          rejectedBy: session.id,
        },
      })
    }

    await prisma.auditLog.create({
      data: {
        performedBy: session.id,
        action: `${action.toUpperCase()}_MECHANIC_PROFILE`,
        entityType: "MechanicProfile",
        entityId: params.id,
        details: {
          businessName: profile.businessName,
          action,
          reason,
          rejectedFields,
        },
      },
    })

    if (profile.user) {
      const notificationTitle =
        action === "approve" ? "Mechanic profile approved" : "Mechanic profile not approved"
      const notificationMessage =
        action === "approve"
          ? "Your mechanic profile has been approved. You can now receive service jobs."
          : `Your mechanic application was rejected. Reason: ${reason || "Please review and resubmit."}`

      await NotificationBridge.sendNotification({
        userId: profile.user.id,
        title: notificationTitle,
        message: notificationMessage,
        type: "SYSTEM",
        module: "AUTO_PARTS",
        data: {
          mechanicProfileId: profile.id,
          businessName: profile.businessName,
          action,
          reason,
        },
      })

      try {
        if (action === "approve" && profile.user.email) {
          await sendEmailFromTemplate(
            profile.user.email,
            "ACCOUNT_VERIFIED_WELCOME",
            {
              app_name: process.env.APP_NAME || "Killo",
              username: profile.businessName || profile.user.name || "Mechanic",
              current_year: new Date().getFullYear().toString(),
              support_email: process.env.SUPPORT_EMAIL || "support@killo.com",
            },
            "GLOBAL",
            "ACCOUNT"
          )
        }
      } catch (emailError) {
        console.error("Mechanic KYC email:", emailError)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Mechanic profile ${action === "approve" ? "approved" : "rejected"} successfully`,
    })
  } catch (error) {
    console.error("Error updating mechanic KYC:", error)
    return NextResponse.json({ error: "Failed to update mechanic profile status" }, { status: 500 })
  }
}
