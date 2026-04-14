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

    const groceryStore = await prisma.groceryStore.findUnique({
      where: { id: params.id },
      include: { 
        user: {
          include: {
            userSettings: true
          }
        } 
      },
    })

    if (!groceryStore) {
      return NextResponse.json({ error: "Grocery store not found" }, { status: 404 })
    }

    const isVerified = action === "approve" ? true : false

    // Update grocery store status
    await prisma.groceryStore.update({
      where: { id: params.id },
      data: {
        isVerified: isVerified,
      },
    })

    // Update user status
    if (action === "approve") {
      await prisma.user.update({
        where: { id: groceryStore.userId },
        data: {
          isActive: true,
          isVerified: true,
          status: "ACTIVE",
        },
      })

      // Ensure wallet + profiles exist for vendors
      const defaultCurrency = await prisma.currency.findFirst({ where: { isDefault: true }, select: { code: true } })
      const currencyCode = defaultCurrency?.code || process.env.DEFAULT_CURRENCY || "USD"
      const ownerName = groceryStore.user?.name || groceryStore.storeName || "Vendor"
      const [firstName, ...rest] = ownerName.trim().split(/\s+/)
      const lastName = rest.join(" ")

      await prisma.wallet.upsert({
        where: { userId: groceryStore.userId },
        update: { currency: currencyCode },
        create: { userId: groceryStore.userId, balance: 0, currency: currencyCode },
      })
      await prisma.userProfile.upsert({
        where: { userId: groceryStore.userId },
        update: { firstName: firstName || null, lastName: lastName || null },
        create: { userId: groceryStore.userId, firstName: firstName || null, lastName: lastName || null },
      })
      await prisma.vendorProfile.upsert({
        where: { userId: groceryStore.userId },
        update: {
          businessName: groceryStore.storeName || ownerName,
          businessType: "GROCERY",
          businessLicense: groceryStore.businessLicense || null,
          description: groceryStore.description || null,
          address: groceryStore.address || "Unknown",
          city: "Unknown",
          state: "Unknown",
          latitude: groceryStore.latitude ?? null,
          longitude: groceryStore.longitude ?? null,
          coverImage: groceryStore.storeFront || null,
          logo: groceryStore.storeFront || null,
        },
        create: {
          userId: groceryStore.userId,
          businessName: groceryStore.storeName || ownerName,
          businessType: "GROCERY",
          businessLicense: groceryStore.businessLicense || null,
          description: groceryStore.description || null,
          address: groceryStore.address || "Unknown",
          city: "Unknown",
          state: "Unknown",
          latitude: groceryStore.latitude ?? null,
          longitude: groceryStore.longitude ?? null,
          coverImage: groceryStore.storeFront || null,
          logo: groceryStore.storeFront || null,
        },
      })
    }

    // Save rejection reason if rejecting
    if (action === "reject") {
      await prisma.kycRejection.create({
        data: {
          entityType: "GROCERY",
          entityId: params.id,
          userId: groceryStore.userId,
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
        action: `${action.toUpperCase()}_GROCERY_STORE`,
        entityType: "GROCERY_STORE",
        entityId: params.id,
        details: {
          storeName: groceryStore.storeName,
          action,
          reason,
          rejectedFields,
        },
      },
    })

    // Send notification and email to grocery store owner
    if (groceryStore.user) {
      const notificationTitle = `Grocery Store ${action === "approve" ? "Approved" : "Rejected"}`
      const notificationMessage = action === "approve"
        ? "Congratulations! Your grocery store has been approved and is now active. You can now start accepting orders."
        : `Your grocery store application has been rejected. Reason: ${reason || "Please review your application and try again."}`

      await NotificationBridge.sendNotification({
        userId: groceryStore.user.id,
        title: notificationTitle,
        message: notificationMessage,
        type: "SYSTEM",
        module: "GROCERY",
        data: {
          storeId: groceryStore.id,
          storeName: groceryStore.storeName,
          action,
          reason,
        }
      })

      // Send email
      try {
        if (action === "approve") {
          await sendEmailFromTemplate(
            groceryStore.user.email!,
            "ACCOUNT_VERIFIED_WELCOME",
            {
              app_name: process.env.APP_NAME || 'Killo',
              username: groceryStore.user.name || groceryStore.storeName,
              current_year: new Date().getFullYear().toString(),
              support_email: process.env.SUPPORT_EMAIL || 'support@killo.com',
            },
            "GLOBAL",
            "ACCOUNT"
          )
        } else {
          await sendEmailFromTemplate(
            groceryStore.user.email!,
            "ACCOUNT_REJECT_REASON_T",
            {
              app_name: process.env.APP_NAME || 'Killo',
              username: groceryStore.user.name || groceryStore.storeName,
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
      message: `Grocery store ${action}d successfully`,
    })
  } catch (error) {
    console.error("Error updating grocery store KYC:", error)
    return NextResponse.json({ error: "Failed to update grocery store status" }, { status: 500 })
  }
}
