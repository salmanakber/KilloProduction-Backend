import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rules = await prisma.automationRule.findMany({
      orderBy: {
        createdAt: "desc",
      },
    })

    const formattedRules = rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      trigger: rule.trigger,
      actions: rule.actions,
      isActive: rule.isActive,
      executionCount: rule.totalExecutions,
      successCount: rule.successfulExecutions,
      failureCount: rule.failedExecutions,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    }))

    return NextResponse.json({
      rules: formattedRules,
      total: rules.length,
    })
  } catch (error) {
    console.error("Error fetching automation rules:", error)
    return NextResponse.json({ error: "Failed to fetch automation rules" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" + user }, { status: 401 })
    }

    const { name, description, trigger, actions } = body

    const rule = await prisma.automationRule.create({
      data: {
        name,
        description,
        trigger,
        actions,
        isActive: true,
        category: "MARKETING",
        conditions: [],
        createdBy: {
          connect: {
            id: user.id,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      rule: {
        id: rule.id,
        name: rule.name,
        isActive: rule.isActive,
      },
    })
  } catch (error) {
    console.error("Error creating automation rule:", error)
    return NextResponse.json({ error: "Failed to create automation rule" }, { status: 500 })
  }
}
