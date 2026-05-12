import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getServerSession } from "next-auth"
import { sendEmailFromTemplate } from "@/lib/email"
import { NotificationBridge } from "@/lib/notification-bridge"
import { SenderType } from "@prisma/client"
import {systemSettings} from "@/lib/systemSettings"



export async function GET(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const session = await authenticateRequest()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

   

    const adminUser = await prisma.user.findUnique({
      where: { id: session.id },
    })

    if (adminUser?.role !== "ADMIN" && adminUser?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }
    

    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      include: {
        userProfile: true,
        autoPartsStore: true,
        pharmacy: true,
        restaurant: true,
        groceryStore: true,
        riderProfile: true,
        customerOrders: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            total: true,
            status: true,
            createdAt: true,
            module: true,
          },
        },
        vendorOrders: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            total: true,
            status: true,
            createdAt: true,
            module: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error("Error fetching user:", error)
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const session = await authenticateRequest()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: session.id },
    })

    if (adminUser?.role !== "ADMIN" && adminUser?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const { name, email, phone, role, isActive, isVerified } = body

    const user = await prisma.user.update({
      where: { id: params.userId },
      data: {
        name,
        email,
        phone,
        role: role?.toUpperCase(),
        isActive,
        isVerified,
      },
    })

    // Log the activity
    await prisma.auditLog.create({
      data: {
        performedBy: session.id,
        action: "UPDATE_USER",
        entityType: "User",
        entityId: user.id,
        details: { changes: body },
      },
    })

    return NextResponse.json({
      message: "User updated successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role.toLowerCase(),
        isActive: user.isActive,
        isVerified: user.isVerified,
      },
    })
  } catch (error) {
    console.error("Error updating user:", error)
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const session = await authenticateRequest()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const settings = await systemSettings()

    const adminUser = await prisma.user.findUnique({
      where: { id: session.id },
    })

    if (adminUser?.role !== "ADMIN" && adminUser?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { status, isVerified, isActive, accountAction, ...otherUpdates } = await request.json()

    const updateData: any = {}
    const targetUser = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, deletedAt: true, isActive: true, status: true },
    })
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (accountAction === "RESTORE_ACCOUNT") {
      if (!targetUser.deletedAt) {
        return NextResponse.json({ error: "This account is not scheduled for recovery." }, { status: 400 })
      }
      const maxRecoveryMs = 30 * 24 * 60 * 60 * 1000
      const canRecover = Date.now() - new Date(targetUser.deletedAt).getTime() <= maxRecoveryMs
      if (!canRecover) {
        return NextResponse.json({ error: "Recovery window expired (over 30 days)." }, { status: 400 })
      }
      updateData.deletedAt = null
      updateData.isActive = true
      updateData.status = "ACTIVE"
    }

    if (accountAction === "DEACTIVATE_ACCOUNT") {
      updateData.isActive = false
      updateData.status = "INACTIVE"
    }

    if (accountAction === "ACTIVATE_ACCOUNT") {
      updateData.isActive = true
      updateData.status = "ACTIVE"
      updateData.deletedAt = null
    }

    if (status !== undefined) {
      // Map frontend status to backend isActive
      updateData.status = status // Directly use status enum
      updateData.isActive = status === "ACTIVE" // Keep isActive for legacy or specific checks
      if (status === "ACTIVE") {
        updateData.deletedAt = null
      }
    }
    if (isVerified !== undefined) {
      updateData.isVerified = isVerified
    }
    if (isActive !== undefined) {
      updateData.isActive = isActive
    }

    // Add other allowed updates
    Object.assign(updateData, otherUpdates)

    const updatedUser = await prisma.user.update({
      where: { id: params.userId },
      data: updateData,
    })

    // Log admin action
    await prisma.auditLog.create({
      data: {
        performedBy: session.id,
        action: accountAction ? String(accountAction) : "UPDATE_USER",
        entityType: "User",
        entityId: params.userId,
        details: {
          changes: updateData,
          accountAction: accountAction || null,
        },
      },
    })

    

    const effectiveStatus =
      status ||
      (accountAction === "ACTIVATE_ACCOUNT" || accountAction === "RESTORE_ACCOUNT"
        ? "ACTIVE"
        : accountAction === "DEACTIVATE_ACCOUNT"
        ? "INACTIVE"
        : null)

    // Send notification + email when status/accountAction changes
    if (effectiveStatus && updatedUser) {

      if (effectiveStatus === "ACTIVE" && updatedUser.email) {
        sendEmailFromTemplate(updatedUser.email!, "ACCOUNT_VERIFIED_WELCOME", {
          username: updatedUser.name,
          app_name: settings.compnyinfo?.company?.name || "Kilo Super App",
          support_email: settings.compnyinfo?.supportCenter?.email || "support@killo.com",
        }, "GLOBAL", "ACCOUNT")
      } else if (effectiveStatus === "INACTIVE" && updatedUser.email) {
        sendEmailFromTemplate(updatedUser.email!, "USER_DEACTIVATION", {
          user_name: updatedUser.name,
          user_email: updatedUser.email,
          deactivation_date: new Date().toLocaleDateString(),
          app_name: settings.compnyinfo?.company?.name || "Kilo Super App",
          current_year: new Date().getFullYear().toString(),
          support_url: settings.compnyinfo?.company?.contact.website + "/support" || "https://killo.com/support",
        }, "GLOBAL", "ACCOUNT")
      }
      else if (effectiveStatus === "SUSPENDED" && updatedUser.email) {
        sendEmailFromTemplate(updatedUser.email!, "ACCOUNT_SUSPENDED", {
          user_name: updatedUser.name,
          user_email: updatedUser.email,
          suspension_date: new Date().toLocaleDateString(),
          app_name: settings.compnyinfo?.company?.name || "Kilo Super App",
          current_year: new Date().getFullYear().toString(),
          support_url: settings.compnyinfo?.company?.contact.website + "/support" || "https://killo.com/support",
        }, "GLOBAL", "ACCOUNT")
      }




    // Send email notification
    await NotificationBridge.sendNotification({
      userId: params.userId,
      title: `Your account has been ${String(effectiveStatus || "").toLowerCase()}`,
      message:
        accountAction === "RESTORE_ACCOUNT"
          ? "Your account has been restored by admin."
          : accountAction === "ACTIVATE_ACCOUNT"
          ? "Your account has been reactivated by admin."
          : accountAction === "DEACTIVATE_ACCOUNT"
          ? "Your account has been deactivated by admin."
          : `Your account has been ${String(effectiveStatus || "").toLowerCase()}`,
      type: "SYSTEM",
      module: "ADMIN",
      data: { 
        actionType: "navigate",
        screen: "/",
        params: [
            { name: "userId", value: params.userId },
        ],
      },
      
    })
    }
    return NextResponse.json({ user: updatedUser })
  } catch (error) {
    console.error("Error updating user:", error)
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const session = await authenticateRequest()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: session.id },
    })

    if (adminUser?.role !== "ADMIN" && adminUser?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const user = await prisma.user.findUnique({
      where: { id: params.userId },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Soft delete by deactivating the user
    await prisma.user.update({
      where: { id: params.userId },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    })

    // Log the activity
    await prisma.auditLog.create({
      data: {
        performedBy: session.id,
        action: "DELETE_USER",
        entityType: "User",
        entityId: params.userId,
        details: {
          changes: user,
        },
      },
    })

    return NextResponse.json({
      message: "User deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting user:", error)
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
  }
}
