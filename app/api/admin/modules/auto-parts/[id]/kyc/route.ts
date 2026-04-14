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

    const autoPartsStore = await prisma.autoPartsStore.findUnique({
      where: { id: params.id },
      include: { 
        user: {
          include: {
            userSettings: true
          }
        } 
      },
    })

    if (!autoPartsStore) {
      return NextResponse.json({ error: "Auto parts store not found" }, { status: 404 })
    }

    const isVerified = action === "approve" ? true : false

    // Update auto parts store status
    await prisma.autoPartsStore.update({
      where: { id: params.id },
      data: {
        isVerified: isVerified,
      },
    })

    // Update user status
    if (action === "approve") {
      await prisma.user.update({
        where: { id: autoPartsStore.userId },
        data: {
          isActive: true,
          isVerified: true,
          status: "ACTIVE",
        },
      })

      // Ensure wallet + profiles exist for vendors
      const defaultCurrency = await prisma.currency.findFirst({ where: { isDefault: true }, select: { code: true } })
      const currencyCode = defaultCurrency?.code || process.env.DEFAULT_CURRENCY || "USD"
      const ownerName = autoPartsStore.user?.name || autoPartsStore.storeName || "Vendor"
      const [firstName, ...rest] = ownerName.trim().split(/\s+/)
      const lastName = rest.join(" ")

      await prisma.wallet.upsert({
        where: { userId: autoPartsStore.userId },
        update: { currency: currencyCode },
        create: { userId: autoPartsStore.userId, balance: 0, currency: currencyCode },
      })
      await prisma.userProfile.upsert({
        where: { userId: autoPartsStore.userId },
        update: { firstName: firstName || null, lastName: lastName || null },
        create: { userId: autoPartsStore.userId, firstName: firstName || null, lastName: lastName || null },
      })
      await prisma.vendorProfile.upsert({
        where: { userId: autoPartsStore.userId },
        update: {
          businessName: autoPartsStore.storeName || ownerName,
          businessType: "AUTO_PARTS",
          businessLicense: autoPartsStore.businessLicense || null,
          taxId: autoPartsStore.taxId || null,
          description: autoPartsStore.description || null,
          address: autoPartsStore.address || "Unknown",
          city: "Unknown",
          state: "Unknown",
          latitude: autoPartsStore.latitude ?? null,
          longitude: autoPartsStore.longitude ?? null,
          coverImage: autoPartsStore.storeFront || null,
          logo: autoPartsStore.storeFront || null,
        },
        create: {
          userId: autoPartsStore.userId,
          businessName: autoPartsStore.storeName || ownerName,
          businessType: "AUTO_PARTS",
          businessLicense: autoPartsStore.businessLicense || null,
          taxId: autoPartsStore.taxId || null,
          description: autoPartsStore.description || null,
          address: autoPartsStore.address || "Unknown",
          city: "Unknown",
          state: "Unknown",
          latitude: autoPartsStore.latitude ?? null,
          longitude: autoPartsStore.longitude ?? null,
          coverImage: autoPartsStore.storeFront || null,
          logo: autoPartsStore.storeFront || null,
        },
      })
    }

    // Save rejection reason if rejecting
    if (action === "reject") {
      await prisma.kycRejection.create({
        data: {
          entityType: "AUTO_PARTS",
          entityId: params.id,
          userId: autoPartsStore.userId,
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
        action: `${action.toUpperCase()}_AUTO_PARTS_STORE`,
        entityType: "AUTO_PARTS_STORE",
        entityId: params.id,
        details: {
          storeName: autoPartsStore.storeName,
          action,
          reason,
          rejectedFields,
        },
      },
    })

    // Send notification and email to auto parts store owner
    if (autoPartsStore.user) {
      const notificationTitle = `Auto Parts Store ${action === "approve" ? "Approved" : "Rejected"}`
      const notificationMessage = action === "approve"
        ? "Congratulations! Your auto parts store has been approved and is now active. You can now start accepting orders."
        : `Your auto parts store application has been rejected. Reason: ${reason || "Please review your application and try again."}`

      await NotificationBridge.sendNotification({
        userId: autoPartsStore.user.id,
        title: notificationTitle,
        message: notificationMessage,
        type: "SYSTEM",
        module: "AUTO_PARTS",
        data: {
          storeId: autoPartsStore.id,
          storeName: autoPartsStore.storeName,
          action,
          reason,
        }
      })

      // Send email
      try {
        if (action === "approve") {
          await sendEmailFromTemplate(
            autoPartsStore.user.email!,
            "ACCOUNT_VERIFIED_WELCOME",
            {
              app_name: process.env.APP_NAME || 'Killo',
              username: autoPartsStore.user.name || autoPartsStore.storeName,
              current_year: new Date().getFullYear().toString(),
              support_email: process.env.SUPPORT_EMAIL || 'support@killo.com',
            },
            "GLOBAL",
            "ACCOUNT"
          )
        } else {
          await sendEmailFromTemplate(
            autoPartsStore.user.email!,
            "ACCOUNT_REJECT_REASON_T",
            {
              app_name: process.env.APP_NAME || 'Killo',
              username: autoPartsStore.user.name || autoPartsStore.storeName,
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
      message: `Auto parts store ${action}d successfully`,
    })
  } catch (error) {
    console.error("Error updating auto parts store KYC:", error)
    return NextResponse.json({ error: "Failed to update auto parts store status" }, { status: 500 })
  }
}
