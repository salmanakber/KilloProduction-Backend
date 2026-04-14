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

    const { status, isVerified, isActive, ...otherUpdates } = await request.json()

    const updateData: any = {}

    if (status !== undefined) {
      // Map frontend status to backend isActive
      updateData.status = status // Directly use status enum
      updateData.isActive = status === "ACTIVE" // Keep isActive for legacy or specific checks
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
        action: "UPDATE_USER",
        entityType: "User",
        entityId: params.userId,
        details: {
          changes: updateData,
        },
      },
    })

    

    // Send notification to user if status changed
    if (status && updatedUser) {

      if(status === "ACTIVE") {
        sendEmailFromTemplate(updatedUser.email!, "ACCOUNT_VERIFIED_WELCOME", {
          username: updatedUser.name,
          app_name: settings.compnyinfo?.company?.name || "Kilo Super App",
          support_email: settings.compnyinfo?.supportCenter?.email || "support@killo.com",
        }, "GLOBAL", "ACCOUNT")
      } else if(status === "INACTIVE") {
        sendEmailFromTemplate(updatedUser.email!, "USER_DEACTIVATION", {
          user_name: updatedUser.name,
          user_email: updatedUser.email,
          deactivation_date: new Date().toLocaleDateString(),
          app_name: settings.compnyinfo?.company?.name || "Kilo Super App",
          current_year: new Date().getFullYear().toString(),
          support_url: settings.compnyinfo?.company?.contact.website + "/support" || "https://killo.com/support",
        }, "GLOBAL", "ACCOUNT")
      }
      else if(status === "SUSPENDED") {
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
      title: `Your account has been ${status?.toLowerCase()}`,
      message: `Your account has been ${status?.toLowerCase()}`,
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
