import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await authenticateRequest(request)
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { id: session.id } })
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

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { id: params.id },
      include: {
        user: { include: { userSettings: true } },
      },
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    const isVerified = action === "approve"

    await prisma.wholesaler.update({
      where: { id: params.id },
      data: { isVerified },
    })

    if (action === "approve") {
      await prisma.user.update({
        where: { id: wholesaler.userId },
        data: { isActive: true, isVerified: true, status: "ACTIVE" },
      })

      // Ensure wallet + profiles exist
      const defaultCurrency = await prisma.currency.findFirst({ where: { isDefault: true }, select: { code: true } })
      const currencyCode = defaultCurrency?.code || process.env.DEFAULT_CURRENCY || "USD"
      const ownerName = wholesaler.user?.name || wholesaler.companyName || "Wholesaler"
      const [firstName, ...rest] = ownerName.trim().split(/\s+/)
      const lastName = rest.join(" ")

      await prisma.wallet.upsert({
        where: { userId: wholesaler.userId },
        update: { currency: currencyCode },
        create: { userId: wholesaler.userId, balance: 0, currency: currencyCode },
      })
      await prisma.userProfile.upsert({
        where: { userId: wholesaler.userId },
        update: { firstName: firstName || null, lastName: lastName || null },
        create: { userId: wholesaler.userId, firstName: firstName || null, lastName: lastName || null },
      })
      await prisma.vendorProfile.upsert({
        where: { userId: wholesaler.userId },
        update: {
          businessName: wholesaler.companyName || ownerName,
          businessType: "WHOLESALER",
          businessLicense: null,
          description: wholesaler.description || null,
          website: wholesaler.website || null,
          logo: wholesaler.logo || null,
          coverImage: wholesaler.logo || null,
          address: wholesaler.address || "Unknown",
          city: "Unknown",
          state: "Unknown",
          latitude: wholesaler.latitude ?? null,
          longitude: wholesaler.longitude ?? null,
        },
        create: {
          userId: wholesaler.userId,
          businessName: wholesaler.companyName || ownerName,
          businessType: "WHOLESALER",
          businessLicense: null,
          description: wholesaler.description || null,
          website: wholesaler.website || null,
          logo: wholesaler.logo || null,
          coverImage: wholesaler.logo || null,
          address: wholesaler.address || "Unknown",
          city: "Unknown",
          state: "Unknown",
          latitude: wholesaler.latitude ?? null,
          longitude: wholesaler.longitude ?? null,
        },
      })
    }

    if (action === "reject") {
      await prisma.kycRejection.create({
        data: {
          entityType: "WHOLESALER",
          entityId: params.id,
          userId: wholesaler.userId,
          rejectionReason: reason,
          rejectedFields: rejectedFields && Array.isArray(rejectedFields) ? rejectedFields : undefined,
          rejectedBy: session.id,
        },
      })
    }

    await prisma.auditLog.create({
      data: {
        performedBy: session.id,
        action: `${action.toUpperCase()}_WHOLESALER`,
        entityType: "WHOLESALER",
        entityId: params.id,
        details: { action, reason, rejectedFields },
      },
    })

    // Notify user
    await NotificationBridge.sendNotification({
      userId: wholesaler.userId,
      title: `Wholesaler ${action === "approve" ? "Approved" : "Rejected"}`,
      message:
        action === "approve"
          ? "Congratulations! Your wholesaler account has been approved and is now active."
          : `Your wholesaler application has been rejected. Reason: ${reason || "Please review your application and try again."}`,
      type: "SYSTEM",
      module: "WHOLESALER",
      data: { wholesalerId: wholesaler.id, action },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating wholesaler KYC:", error)
    return NextResponse.json({ error: "Failed to update wholesaler status" }, { status: 500 })
  }
}

