import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
import { sendEmail } from "@/lib/email"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const data = await request.json()
    const { wholesalerId, approvedMedicineCategories, deliveryZones, paymentTerms } = data

    if (!wholesalerId || !approvedMedicineCategories || approvedMedicineCategories.length === 0) {
      return NextResponse.json(
        {
          error: "Wholesaler ID and approved medicine categories are required",
        },
        { status: 400 },
      )
    }

    // Get wholesaler with user info for notifications
    const wholesaler = await prisma.wholesaler.findUnique({
      where: { id: wholesalerId },
      include: { 
        user: {
          include: {
            userSettings: true
          }
        } 
      }
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    // Update wholesaler with approved categories
    const updatedWholesaler = await prisma.wholesaler.update({
      where: { id: wholesalerId },
      data: {
        isVerified: true,
        specialties: approvedMedicineCategories,
        deliveryZones: deliveryZones || [],
        paymentTerms: paymentTerms || "Net 30",
      },
    })

    // Send notification and email to wholesaler
    if (wholesaler.user) {
      const notificationTitle = "Wholesaler Account Approved"
      const notificationMessage = `Your wholesaler account has been approved. You can now supply medicines in categories: ${approvedMedicineCategories.join(", ")}`

      // Send notification via NotificationBridge (includes WebSocket and Expo Push)
      await NotificationBridge.sendNotification({
        userId: wholesaler.userId,
        title: notificationTitle,
        message: notificationMessage,
        type: "SYSTEM",
        module: "PHARMACY",
        data: {
          wholesalerId: wholesaler.id,
          approvedCategories: approvedMedicineCategories,
          deliveryZones,
          paymentTerms
        }
      })

      // Also send a direct push notification to ensure delivery
      if (wholesaler.user?.userSettings?.pushNotifications && wholesaler.user?.userSettings?.deviceTokens) {
        try {
          const deviceTokens = Array.isArray(wholesaler.user.userSettings.deviceTokens as any) 
            ? (wholesaler.user.userSettings.deviceTokens as string[]) 
            : []
          
          if (deviceTokens.length > 0) {
            await NotificationBridge.sendPushNotification({
              userId: wholesaler.userId,
              title: notificationTitle,
              body: notificationMessage,
              data: {
                wholesalerId: wholesaler.id,
                approvedCategories: approvedMedicineCategories,
                deliveryZones,
                paymentTerms,
                type: "WHOLESALER_APPROVAL"
              }
            })
            console.log(`📱 Expo push notification sent to ${deviceTokens.length} device(s) for wholesaler approval`)
          }
        } catch (pushError) {
          console.error("❌ Error sending Expo push notification:", pushError)
        }
      }

      // Send email notification
      try {
        const emailContent = `
          <h2>🎉 Wholesaler Account Approved!</h2>
          <p>Dear ${wholesaler.user.name},</p>
          <p>Great news! Your wholesaler account has been approved and is now active on our platform.</p>
          <p><strong>Approved Categories:</strong> ${approvedMedicineCategories.join(", ")}</p>
          <p><strong>Delivery Zones:</strong> ${deliveryZones?.join(", ") || "All zones"}</p>
          <p><strong>Payment Terms:</strong> ${paymentTerms || "Net 30"}</p>
          <p>You can now:</p>
          <ul>
            <li>Supply medicines to pharmacies</li>
            <li>Manage your inventory</li>
            <li>Process orders from pharmacies</li>
            <li>Access your wholesaler dashboard</li>
          </ul>
          <p>If you have any questions, please don't hesitate to contact our support team.</p>
          <p>Best regards,<br>The SuperKillo Team</p>
        `

        await sendEmail({
          to: wholesaler.user.email,
          subject: "🎉 Your Wholesaler Account Has Been Approved!",
          html: emailContent,
          template: "wholesaler-approval"
        })

        console.log(`📧 Email sent to ${wholesaler.user.email} for wholesaler approval`)
      } catch (emailError) {
        console.error("❌ Error sending email notification:", emailError)
        // Don't fail the entire request if email fails
      }

      // Update user verification status
      await prisma.user.update({
        where: { id: wholesaler.userId },
        data: { 
          isVerified: true,
          status: "ACTIVE"
        }
      })
    }

    return NextResponse.json({
      message: "Wholesaler approved successfully",
      wholesaler,
    })
  } catch (error) {
    console.error("Wholesaler approval error:", error)
    return NextResponse.json({ error: "Failed to approve wholesaler" }, { status: 500 })
  }
}
