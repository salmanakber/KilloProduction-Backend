import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
import { sendEmail } from "@/lib/email"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify admin role
    const admin = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (!admin || !["ADMIN", "SUPER_ADMIN"].includes(admin.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { riderId, approved, notes } = await request.json()

    // Get rider profile
    const rider = await prisma.user.findUnique({
      where: { id: riderId },
      include: {
        riderProfile: true,
        userProfile: true,
        userSettings: true,
      },
    })

    if (!rider || rider.role !== "RIDER") {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 })
    }

    // Update rider approval status
    const updatedRider = await prisma.riderProfile.update({
      where: { userId: riderId },
      data: {
        isApproved: approved,
        isVerified: approved, // Auto-verify when approved
        verificationNotes: notes,
        approvedAt: approved ? new Date() : null,
        approvedBy: approved ? session.user.id : null,
      },
    })

    // Send notification and email to rider
    const notificationTitle = approved ? "Application Approved!" : "Application Rejected"
    const notificationMessage = approved
      ? "Congratulations! Your rider application has been approved. You can now start accepting rides and earning money."
      : `Your rider application has been rejected. ${notes || "Please contact support for more information."}`

    // Send notification via NotificationBridge (includes WebSocket and Expo Push)
    await NotificationBridge.sendNotification({
      userId: riderId,
      title: notificationTitle,
      message: notificationMessage,
      type: "SYSTEM",
      module: "RIDER",
      data: {
        approved,
        notes,
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
              approved,
              notes,
              riderId,
              type: "RIDER_STATUS_UPDATE"
            }
          })
          console.log(`📱 Expo push notification sent to ${deviceTokens.length} device(s) for rider ${approved ? 'approval' : 'rejection'}`)
        }
      } catch (pushError) {
        console.error("❌ Error sending Expo push notification:", pushError)
      }
    }

    // Send email notification
    try {
      const emailSubject = approved 
        ? "🎉 Your Rider Application Has Been Approved!" 
        : "❌ Rider Application Update"
      
      const emailContent = approved 
        ? `
          <h2>Congratulations! 🎉</h2>
          <p>Dear ${rider.name},</p>
          <p>Great news! Your rider application has been approved and you can now start accepting rides on our platform.</p>
          <p>You can now:</p>
          <ul>
            <li>Start accepting ride requests</li>
            <li>Earn money by completing deliveries</li>
            <li>Access your rider dashboard</li>
            <li>Track your earnings and performance</li>
          </ul>
          <p>Please make sure to:</p>
          <ul>
            <li>Complete your profile setup</li>
            <li>Upload required documents</li>
            <li>Set your availability preferences</li>
          </ul>
          <p>If you have any questions, please don't hesitate to contact our support team.</p>
          <p>Best regards,<br>The SuperKillo Team</p>
        `
        : `
          <h2>Rider Application Update</h2>
          <p>Dear ${rider.name},</p>
          <p>We regret to inform you that your rider application has been rejected.</p>
          <p><strong>Reason:</strong> ${notes || "Please review your application and ensure all required documents are properly submitted."}</p>
          <p>You can:</p>
          <ul>
            <li>Review the rejection reason</li>
            <li>Update your application with the required information</li>
            <li>Resubmit your application</li>
            <li>Contact our support team for assistance</li>
          </ul>
          <p>We encourage you to address the issues and resubmit your application.</p>
          <p>Best regards,<br>The SuperKillo Team</p>
        `

      await sendEmail({
        to: rider.email,
        subject: emailSubject,
        html: emailContent,
        template: "rider-status-update"
      })

      console.log(`📧 Email sent to ${rider.email} for rider ${approved ? 'approval' : 'rejection'}`)
    } catch (emailError) {
      console.error("❌ Error sending email notification:", emailError)
      // Don't fail the entire request if email fails
    }

    return NextResponse.json({
      message: approved ? "Rider approved successfully" : "Rider rejected",
      rider: {
        ...rider,
        riderProfile: updatedRider,
      },
    })
  } catch (error) {
    console.error("Error updating rider approval:", error)
    return NextResponse.json({ error: "Failed to update rider status" }, { status: 500 })
  }
}
