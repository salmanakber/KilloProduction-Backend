import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const settingKey = searchParams.get("settingKey")

    const where: any = {}
    if (settingKey) {
      where.settingKey = settingKey
    }

    const versions = await prisma.settingVersion.findMany({
      where,
      include: {
        changedBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    return NextResponse.json({ versions })
  } catch (error) {
    console.error("Error fetching setting versions:", error)
    return NextResponse.json({ error: "Failed to fetch setting versions" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { settingKey, oldValue, newValue, changeReason } = await request.json()

    if (!settingKey || !newValue) {
      return NextResponse.json({ error: "Setting key and new value are required" }, { status: 400 })
    }

    // Create version record
    const version = await prisma.settingVersion.create({
      data: {
        settingKey,
        oldValue: JSON.stringify(oldValue),
        newValue: JSON.stringify(newValue),
        changeReason,
        changedById: session.user.id,
      },
      include: {
        changedBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    // Update the actual setting
    await prisma.systemSetting.upsert({
      where: { key: settingKey },
      update: {
        value: JSON.stringify(newValue),
        updatedAt: new Date(),
        updatedById: session.user.id,
      },
      create: {
        key: settingKey,
        value: JSON.stringify(newValue),
        createdById: session.user.id,
        updatedById: session.user.id,
      },
    })

    // Log admin action
    await prisma.adminAuditLog.create({
      data: {
        adminId: session.user.id,
        action: "UPDATE_SYSTEM_SETTING",
        module: "SETTINGS",
        details: JSON.stringify({
          settingKey,
          versionId: version.id,
          changeReason,
        }),
      },
    })

    return NextResponse.json({ version }, { status: 201 })
  } catch (error) {
    console.error("Error creating setting version:", error)
    return NextResponse.json({ error: "Failed to create setting version" }, { status: 500 })
  }
}
