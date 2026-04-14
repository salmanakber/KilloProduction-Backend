import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const { trigger, entityId, entityType } = await request.json()

    // Get active automation rules for this trigger
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        trigger: {
          contains: trigger,
        },
      },
    })

    const executedRules = []

    for (const rule of rules) {
      try {
        const triggerData = JSON.parse(rule.trigger)
        const conditions = JSON.parse(rule.conditions)
        const actions = JSON.parse(rule.actions)

        // Check if trigger matches
        if (triggerData.event !== trigger) continue

        // Evaluate conditions
        let conditionsMet = true
        for (const condition of conditions) {
          const result = await evaluateCondition(condition, entityId, entityType)
          if (!result) {
            conditionsMet = false
            break
          }
        }

        if (conditionsMet) {
          // Execute actions
          for (const action of actions) {
            await executeAction(action, entityId, entityType)
          }

          executedRules.push(rule.id)

          // Log rule execution
          await prisma.automationExecution.create({
            data: {
              ruleId: rule.id,
              entityId,
              entityType,
              trigger,
              status: "SUCCESS",
              executedAt: new Date(),
            },
          })
        }
      } catch (error) {
        console.error(`Error executing rule ${rule.id}:`, error)
        await prisma.automationExecution.create({
          data: {
            ruleId: rule.id,
            entityId,
            entityType,
            trigger,
            status: "FAILED",
            error: error instanceof Error ? error.message : "Unknown error",
            executedAt: new Date(),
          },
        })
      }
    }

    return NextResponse.json({ executedRules })
  } catch (error) {
    console.error("Error executing automation:", error)
    return NextResponse.json({ error: "Failed to execute automation" }, { status: 500 })
  }
}

async function evaluateCondition(condition: any, entityId: string, entityType: string): Promise<boolean> {
  switch (condition.type) {
    case "complaint_count":
      const complaintCount = await prisma.supportTicket.count({
        where: {
          targetId: entityId,
          targetType: entityType,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      })
      return complaintCount >= condition.value

    case "order_failure_rate":
      const [totalOrders, failedOrders] = await Promise.all([
        prisma.order.count({
          where: { vendorId: entityId },
        }),
        prisma.order.count({
          where: {
            vendorId: entityId,
            status: { in: ["CANCELLED", "FAILED"] },
          },
        }),
      ])
      const failureRate = totalOrders > 0 ? (failedOrders / totalOrders) * 100 : 0
      return failureRate >= condition.value

    case "rating_below":
      const avgRating = await prisma.review.aggregate({
        where: {
          targetId: entityId,
          targetType: entityType,
        },
        _avg: { rating: true },
      })
      return (avgRating._avg.rating || 0) < condition.value

    default:
      return false
  }
}

async function executeAction(action: any, entityId: string, entityType: string): Promise<void> {
  switch (action.type) {
    case "suspend_user":
      await prisma.user.update({
        where: { id: entityId },
        data: { isActive: false },
      })
      break

    case "send_notification":
      await prisma.notification.create({
        data: {
          userId: entityId,
          title: action.title,
          message: action.message,
          type: "SYSTEM",
        },
      })
      break

    case "create_support_ticket":
      await prisma.supportTicket.create({
        data: {
          title: action.title,
          description: action.description,
          priority: action.priority || "MEDIUM",
          status: "OPEN",
          targetId: entityId,
          targetType: entityType,
          source: "AUTOMATION",
        },
      })
      break

    case "adjust_commission":
      // Implementation depends on your commission structure
      break

    default:
      console.warn(`Unknown action type: ${action.type}`)
  }
}
