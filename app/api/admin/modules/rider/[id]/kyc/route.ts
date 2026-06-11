import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
import { sendEmailFromTemplate } from "@/lib/email"
import {
  applyRiderKycApproved,
  applyRiderKycRejected,
  applyUserKycApproved,
  applyUserKycRejected,
  createKycRejectionRecord,
  ensureUserWalletAndProfile,
} from "@/lib/kyc-admin-status-sync"

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

    const { status, reason, rejectedFields } = await request.json()
    const action = status === "APPROVED" ? "approve" : status === "REJECTED" ? "reject" : null

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    if (action === "reject" && !reason?.trim()) {
      return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 })
    }
    const riderId = params.id

    // Get rider with user info for notifications
    const rider = await prisma.user.findUnique({
      where: { id: riderId },
      include: { 
        riderProfile: true,
        userSettings: true
      }
    })

    if (!rider) {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 })
    }

    // Update rider profile status
    if (action === "approve") {
      await applyRiderKycApproved(riderId, session.id)
      await applyUserKycApproved(riderId)
      await ensureUserWalletAndProfile(riderId, rider.name || "Rider")
    } else {
      await applyRiderKycRejected(riderId, reason || "Rejected by admin")
      await applyUserKycRejected(riderId)
    }

    const updatedProfile = await prisma.riderProfile.findUnique({
      where: { userId: riderId },
    })

    // Save rejection reason if rejecting
    if (action === "reject" && rider.riderProfile) {
      await createKycRejectionRecord({
        entityType: "RIDER",
        entityId: riderId,
        userId: riderId,
        rejectionReason: reason,
        rejectedBy: session.id,
        rejectedFields:
          rejectedFields && Array.isArray(rejectedFields) ? rejectedFields : undefined,
      })
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        performedBy: session.id,
        action: "UPDATE_RIDER_STATUS",
        entityType: "RIDER",
        entityId: riderId,
        details: {
          newStatus: status,
          previousStatus: updatedProfile?.isApproved ? "APPROVED" : "PENDING",
          reason,
          rejectedFields,
        },
      },
    })

    // Send notification and email to rider
    const notificationTitle = `Application ${status}`
    const notificationMessage = status === "APPROVED"
      ? "Congratulations! Your rider application has been approved. You can now start accepting rides and earning money."
      : status === "REJECTED"
        ? `Your rider application has been rejected. ${reason || "Please contact support for more information."}`
        : "Your rider application is under review."

    // Send notification via NotificationBridge (includes WebSocket and Expo Push)
    await NotificationBridge.sendNotification({
      userId: riderId,
      title: notificationTitle,
      message: notificationMessage,
      type: "SYSTEM",
      module: "RIDING",
      data: {
        status,
        reason,
        riderId
      }
    })

    // Also send a direct push notification to ensure delivery
    if (rider.userSettings?.pushNotifications && rider.userSettings?.deviceTokens) {
      try {
        const deviceTokens = Array.isArray(rider.userSettings.deviceTokens as any) 
          ? (rider.userSettings.deviceTokens as string[]) 
          : []
        
        if (deviceTokens.length > 0) {
          await NotificationBridge.sendPushNotification({
            userId: riderId,
            title: notificationTitle,
            body: notificationMessage,
            data: {
              status,
              reason,
              riderId,
              type: "RIDER_KYC_UPDATE"
            }
          })
          console.log(`📱 Expo push notification sent to ${deviceTokens.length} device(s) for rider status: ${status}`)
        }
      } catch (pushError) {
        console.error("❌ Error sending Expo push notification:", pushError)
      }
    }

    // Send email notification
    try {
      if (action === "approve") {
        await sendEmailFromTemplate(
          rider.email!,
          "ACCOUNT_VERIFIED_WELCOME",
          {
            app_name: process.env.APP_NAME || 'Killo',
            username: rider.name || 'Rider',
            current_year: new Date().getFullYear().toString(),
            support_email: process.env.SUPPORT_EMAIL || 'support@killo.com',
          },
          "GLOBAL",
          "ACCOUNT"
        )
      } else if (action === "reject") {
        await sendEmailFromTemplate(
          rider.email!,
          "ACCOUNT_REJECT_REASON_T",
          {
            app_name: process.env.APP_NAME || 'Killo',
            username: rider.name || 'Rider',
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

    return NextResponse.json({
      success: true,
      message: `Rider ${status.toLowerCase()} successfully`,
    })
  } catch (error) {
    console.error("Error updating rider status:", error)
    return NextResponse.json({ error: "Failed to update rider status" }, { status: 500 })
  }
}
