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

    const user = await prisma.user.findUnique({
      where: { id: session.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { action, reason, rejectedFields } = await request.json()

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    if (action === "reject" && !reason?.trim()) {
      return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: params.id },
      include: { 
        user: {
          include: {
            userSettings: true
          }
        } 
      },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    const newStatus = action === "approve" ? "APPROVED" : "REJECTED"
    const isVerified = action === "approve" ? true : false

    // Update pharmacy status
    await prisma.pharmacy.update({
      where: { id: params.id },
      data: {
        status: newStatus,
        approvalDate: action === "approve" ? new Date() : null,
        rejectedAt: action === "reject" ? new Date() : null,
        rejectionReason: action === "reject" ? reason : null,
        isVerified: isVerified,
      },
    })
    // Update user status
    if (action === "approve") {
      await prisma.user.update({
        where: { id: pharmacy.userId },
        data: {
          isActive: true,
          isVerified: true,
          status: "ACTIVE",
        },
      })

      // Ensure wallet + profiles exist for vendors
      const defaultCurrency = await prisma.currency.findFirst({ where: { isDefault: true }, select: { code: true } })
      const currencyCode = defaultCurrency?.code || process.env.DEFAULT_CURRENCY || "USD"
      const ownerName = pharmacy.user?.name || pharmacy.pharmacyName || "Vendor"
      const [firstName, ...rest] = ownerName.trim().split(/\s+/)
      const lastName = rest.join(" ")

      await prisma.wallet.upsert({
        where: { userId: pharmacy.userId },
        update: { currency: currencyCode },
        create: { userId: pharmacy.userId, balance: 0, currency: currencyCode },
      })
      await prisma.userProfile.upsert({
        where: { userId: pharmacy.userId },
        update: { firstName: firstName || null, lastName: lastName || null },
        create: { userId: pharmacy.userId, firstName: firstName || null, lastName: lastName || null },
      })
      await prisma.vendorProfile.upsert({
        where: { userId: pharmacy.userId },
        update: {
          businessName: pharmacy.pharmacyName || ownerName,
          businessType: "PHARMACY",
          businessLicense: pharmacy.licenseDocument || null,
          description: pharmacy.description || null,
          address: pharmacy.address || "Unknown",
          city: "Unknown",
          state: "Unknown",
          latitude: pharmacy.lat ?? null,
          longitude: pharmacy.lon ?? null,
        },
        create: {
          userId: pharmacy.userId,
          businessName: pharmacy.pharmacyName || ownerName,
          businessType: "PHARMACY",
          businessLicense: pharmacy.licenseDocument || null,
          description: pharmacy.description || null,
          address: pharmacy.address || "Unknown",
          city: "Unknown",
          state: "Unknown",
          latitude: pharmacy.lat ?? null,
          longitude: pharmacy.lon ?? null,
        },
      })
    }

    // Save rejection reason if rejecting
    if (action === "reject") {
      await prisma.kycRejection.create({
        data: {
          entityType: "PHARMACY",
          entityId: params.id,
          userId: pharmacy.userId,
          rejectionReason: reason,
          rejectedFields: rejectedFields && Array.isArray(rejectedFields) ? rejectedFields : undefined,
          rejectedBy: session.id,
        },
      })
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        performedBy: session.id,
        action: `${action.toUpperCase()}_PHARMACY`,
        entityType: "PHARMACY",
        entityId: params.id,
        details: {
          pharmacyName: pharmacy.pharmacyName,
          action,
          reason,
          rejectedFields,
        },
      },
    })

    // Send notification and email to pharmacy owner
    if (pharmacy.user) {
      const notificationTitle = `Pharmacy ${action === "approve" ? "Approved" : "Rejected"}`
      const notificationMessage = action === "approve"
        ? "Congratulations! Your pharmacy has been approved and is now active. You can now start accepting orders and managing your pharmacy."
        : `Your pharmacy application has been rejected. Reason: ${reason || "Please review your application and try again."}`

      // Send notification via NotificationBridge (includes WebSocket and Expo Push)
      await NotificationBridge.sendNotification({
          userId: pharmacy.user.id,
        title: notificationTitle,
        message: notificationMessage,
          type: "SYSTEM",
          module: "PHARMACY",
        data: {
          pharmacyId: pharmacy.id,
          pharmacyName: pharmacy.pharmacyName,
          action,
          reason,
          status: newStatus
        }
      })

      // Also send a direct push notification to ensure delivery
      if (pharmacy.user.userSettings?.pushNotifications && pharmacy.user.userSettings?.deviceTokens) {
        try {
          const deviceTokens = Array.isArray(pharmacy.user.userSettings.deviceTokens as any) 
            ? (pharmacy.user.userSettings.deviceTokens as string[]) 
            : []
          
          if (deviceTokens.length > 0) {
            await NotificationBridge.sendPushNotification({
              userId: pharmacy.user.id,
              title: notificationTitle,
              body: notificationMessage,
              data: {
                pharmacyId: pharmacy.id,
                pharmacyName: pharmacy.pharmacyName,
                action,
                reason,
                status: newStatus,
                type: "PHARMACY_STATUS_UPDATE"
              }
            })
            console.log(`📱 Expo push notification sent to ${deviceTokens.length} device(s) for pharmacy ${action}`)
          }
        } catch (pushError) {
          console.error("❌ Error sending Expo push notification:", pushError)
        }
      }

      // Send email notification
      try {
        if (action === "approve") {
          await sendEmailFromTemplate(
            pharmacy.user.email!,
            "ACCOUNT_VERIFIED_WELCOME",
            {
              app_name: process.env.APP_NAME || 'Killo',
              username: pharmacy.user.name || pharmacy.pharmacyName,
              current_year: new Date().getFullYear().toString(),
              support_email: process.env.SUPPORT_EMAIL || 'support@killo.com',
            },
            "GLOBAL",
            "ACCOUNT"
          )
        } else {
          await sendEmailFromTemplate(
            pharmacy.user.email!,
            "ACCOUNT_REJECT_REASON_T",
            {
              app_name: process.env.APP_NAME || 'Killo',
              username: pharmacy.user.name || pharmacy.pharmacyName,
              current_year: new Date().getFullYear().toString(),
              support_email: process.env.SUPPORT_EMAIL || 'support@killo.com',
            },
            "GLOBAL",
            "ACCOUNT"
          )
        }
      } catch (emailError) {
        console.error("❌ Error sending email notification:", emailError)
        // Don't fail the entire request if email fails
      }
    }

    return NextResponse.json({
      success: true,
      message: `Pharmacy ${action}d successfully`,
    })
  } catch (error) {
    console.error("Error updating pharmacy KYC:", error)
    return NextResponse.json({ error: "Failed to update pharmacy status" }, { status: 500 })
  }
}
