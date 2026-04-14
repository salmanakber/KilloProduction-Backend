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

    const rules = await prisma.automationRule.findMany({
      include: {
        createdBy: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ rules })
  } catch (error) {
    console.error("Error fetching automation rules:", error)
    return NextResponse.json({ error: "Failed to fetch automation rules" }, { status: 500 })
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

    const ruleData = await request.json()
    const { name, description, trigger, conditions, actions, isActive } = ruleData

    const rule = await prisma.automationRule.create({
      data: {
        name,
        description,
        trigger: JSON.stringify(trigger),
        conditions: JSON.stringify(conditions),
        actions: JSON.stringify(actions),
        isActive: isActive ?? true,
        createdById: session.user.id,
      },
      include: {
        createdBy: {
          select: { name: true },
        },
      },
    })

    // Log admin action
    await prisma.adminAuditLog.create({
      data: {
        adminId: session.user.id,
        action: "CREATE_AUTOMATION_RULE",
        module: "AUTOMATION",
        details: JSON.stringify({
          ruleId: rule.id,
          ruleName: name,
        }),
      },
    })

    return NextResponse.json({ rule }, { status: 201 })
  } catch (error) {
    console.error("Error creating automation rule:", error)
    return NextResponse.json({ error: "Failed to create automation rule" }, { status: 500 })
  }
}
