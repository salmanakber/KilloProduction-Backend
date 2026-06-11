import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
import { sendEmailFromTemplate } from "@/lib/email"
import {
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

    const { action, reason, rejectedFields } = await request.json()

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    if (action === "reject" && !reason?.trim()) {
      return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: params.id },
      include: { 
        user: {
          include: {
            userSettings: true
          }
        } 
      },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    const isVerified = action === "approve" ? true : false

    // Update restaurant status
    await prisma.restaurant.update({
      where: { id: params.id },
      data: {
        isVerified: isVerified,
      },
    })

    const ownerName = restaurant.user?.name || restaurant.name || "Vendor"

    // Update user status
    if (action === "approve") {
      await applyUserKycApproved(restaurant.userId)
      await ensureUserWalletAndProfile(restaurant.userId, ownerName)
      await prisma.vendorProfile.upsert({
        where: { userId: restaurant.userId },
        update: {
          businessName: restaurant.name || ownerName,
          businessType: "FOOD",
          businessLicense: restaurant.businessLicense || null,
          description: restaurant.description || null,
          address: restaurant.address || "Unknown",
          city: "Unknown",
          state: "Unknown",
          latitude: restaurant.latitude ?? null,
          longitude: restaurant.longitude ?? null,
          coverImage: restaurant.restaurantFront || null,
          logo: restaurant.restaurantFront || null,
        },
        create: {
          userId: restaurant.userId,
          businessName: restaurant.name || ownerName,
          businessType: "FOOD",
          businessLicense: restaurant.businessLicense || null,
          description: restaurant.description || null,
          address: restaurant.address || "Unknown",
          city: "Unknown",
          state: "Unknown",
          latitude: restaurant.latitude ?? null,
          longitude: restaurant.longitude ?? null,
          coverImage: restaurant.restaurantFront || null,
          logo: restaurant.restaurantFront || null,
        },
      })
    } else {
      await applyUserKycRejected(restaurant.userId)
    }

    // Save rejection reason if rejecting
    if (action === "reject") {
      await createKycRejectionRecord({
        entityType: "FOOD",
        entityId: params.id,
        userId: restaurant.userId,
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
        action: `${action.toUpperCase()}_RESTAURANT`,
        entityType: "RESTAURANT",
        entityId: params.id,
        details: {
          restaurantName: restaurant.name,
          action,
          reason,
          rejectedFields,
        },
      },
    })

    // Send notification and email to restaurant owner
    if (restaurant.user) {
      const notificationTitle = `Restaurant ${action === "approve" ? "Approved" : "Rejected"}`
      const notificationMessage = action === "approve"
        ? "Congratulations! Your restaurant has been approved and is now active. You can now start accepting orders."
        : `Your restaurant application has been rejected. Reason: ${reason || "Please review your application and try again."}`

      await NotificationBridge.sendNotification({
        userId: restaurant.user.id,
        title: notificationTitle,
        message: notificationMessage,
        type: "SYSTEM",
        module: "FOOD",
        data: {
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          action,
          reason,
        }
      })

      // Send email
      try {
        if (action === "approve") {
          await sendEmailFromTemplate(
            restaurant.user.email!,
            "ACCOUNT_VERIFIED_WELCOME",
            {
              app_name: process.env.APP_NAME || 'Killo',
              username: restaurant.user.name || restaurant.name,
              current_year: new Date().getFullYear().toString(),
              support_email: process.env.SUPPORT_EMAIL || 'support@killo.com',
            },
            "GLOBAL",
            "ACCOUNT"
          )
        } else {
          await sendEmailFromTemplate(
            restaurant.user.email!,
            "ACCOUNT_REJECT_REASON_T",
            {
              app_name: process.env.APP_NAME || 'Killo',
              username: restaurant.user.name || restaurant.name,
              current_year: new Date().getFullYear().toString(),
              support_email: process.env.SUPPORT_EMAIL || 'support@killo.com',
            },
            "GLOBAL",
            "ACCOUNT"
          )
        }
      } catch (emailError) {
        console.error("Failed to send email:", emailError)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Restaurant ${action}d successfully`,
    })
  } catch (error) {
    console.error("Error updating restaurant KYC:", error)
    return NextResponse.json({ error: "Failed to update restaurant status" }, { status: 500 })
  }
}
