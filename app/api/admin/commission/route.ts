import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get all commission settings
    const commissionSettings = await prisma.commissionSetting.findMany({
      orderBy: [
        { module: 'asc' },
        { commissionType: 'asc' }
      ]
    })

    return NextResponse.json({ commissionSettings })
  } catch (error) {
    console.error("Error fetching commission settings:", error)
    return NextResponse.json({ error: "Failed to fetch commission settings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()

    // Create new commission setting
    const commissionSetting = await prisma.commissionSetting.create({
      data: {
        module: data.module,
        commissionType: data.commissionType,
        rate: data.rate,
        minAmount: data.minAmount,
        maxAmount: data.maxAmount,
        isActive: data.isActive,
        description: data.description,
      }
    })

    // Create audit log
    await prisma.auditLog.create({
      data: {
        performedBy: user.id,
        action: "CREATE_COMMISSION_SETTING",
        entityType: "COMMISSION_SETTING",
        entityId: commissionSetting.id,
        details: {
          commissionSetting: data,
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Commission setting created successfully",
      commissionSetting,
    })
  } catch (error) {
    console.error("Error creating commission setting:", error)
    return NextResponse.json({ error: "Failed to create commission setting" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()

    // Update commission setting
    const updatedSetting = await prisma.commissionSetting.update({
      where: { id: data.id },
      data: {
        rate: data.rate,
        minAmount: data.minAmount,
        maxAmount: data.maxAmount,
        isActive: data.isActive,
        description: data.description,
        updatedAt: new Date(),
      }
    })

    // Create audit log
    await prisma.auditLog.create({
      data: {
        performedBy: user.id,
        action: "UPDATE_COMMISSION_SETTING",
        entityType: "COMMISSION_SETTING",
        entityId: data.id,
        details: {
          changes: data,
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Commission setting updated successfully",
      commissionSetting: updatedSetting,
    })
  } catch (error) {
    console.error("Error updating commission setting:", error)
    return NextResponse.json({ error: "Failed to update commission setting" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: "Commission setting ID is required" }, { status: 400 })
    }

    // Delete commission setting
    await prisma.commissionSetting.delete({
      where: { id }
    })

    // Create audit log
    await prisma.auditLog.create({
      data: {
        performedBy: user.id,
        action: "DELETE_COMMISSION_SETTING",
        entityType: "COMMISSION_SETTING",
        entityId: id,
        details: {
          deletedAt: new Date(),
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Commission setting deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting commission setting:", error)
    return NextResponse.json({ error: "Failed to delete commission setting" }, { status: 500 })
  }
}

