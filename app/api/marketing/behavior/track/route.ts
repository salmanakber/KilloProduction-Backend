import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, eventType, module, entityId, entityType, properties, sessionId, deviceInfo, location } = body

    // Validate required fields
    if (!userId || !eventType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Create behavior event
    const event = await prisma.customerBehaviorEvent.create({
      data: {
        userId,
        eventType,
        module,
        entityId,
        entityType,
        properties,
        sessionId,
        deviceInfo,
        location,
      },
    })

    // Update interest profiles based on event
    await updateInterestProfile(userId, eventType, module, entityType, properties)

    // Check for automation triggers
    await checkAutomationTriggers(userId, eventType, properties)

    return NextResponse.json({ success: true, eventId: event.id })
  } catch (error) {
    console.error("Error tracking behavior:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function updateInterestProfile(
  userId: string,
  eventType: string,
  module?: string,
  entityType?: string,
  properties?: any,
) {
  if (!module) return

  try {
    // Get or create interest profile
    const profile = await prisma.customerInterestProfile.upsert({
      where: {
        userId_module_category: {
          userId,
          module: module as any,
          category: entityType || "general",
        },
      },
      update: {
        interactionCount: { increment: 1 },
        lastInteraction: new Date(),
        interestScore: { increment: getScoreIncrement(eventType) },
      },
      create: {
        userId,
        module: module as any,
        category: entityType || "general",
        interactionCount: 1,
        lastInteraction: new Date(),
        interestScore: getScoreIncrement(eventType),
      },
    })

    // Cap interest score at 100
    if (profile.interestScore > 100) {
      await prisma.customerInterestProfile.update({
        where: { id: profile.id },
        data: { interestScore: 100 },
      })
    }
  } catch (error) {
    console.error("Error updating interest profile:", error)
  }
}

function getScoreIncrement(eventType: string): number {
  const scoreMap: Record<string, number> = {
    PRODUCT_VIEW: 1,
    CATEGORY_VIEW: 0.5,
    ADD_TO_CART: 3,
    ORDER_PLACED: 10,
    SEARCH: 2,
    SHARE_PRODUCT: 5,
    WISHLIST_ADD: 2,
    REVIEW_SUBMITTED: 5,
  }
  return scoreMap[eventType] || 0.1
}

async function checkAutomationTriggers(userId: string, eventType: string, properties?: any) {
  try {
    // Get active automation rules that match this trigger
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        trigger: {
          path: ["eventType"],
          equals: eventType,
        },
      },
    })

    for (const rule of rules) {
      // Check if conditions are met
      const conditionsMet = await evaluateConditions(userId, rule.conditions as any, properties)

      if (conditionsMet) {
        // Check cooldown period
        const recentExecution = await prisma.automationExecution.findFirst({
          where: {
            ruleId: rule.id,
            userId,
            executedAt: {
              gte: new Date(Date.now() - (rule.cooldownPeriod || 0) * 60 * 1000),
            },
          },
        })

        if (!recentExecution) {
          await executeAutomationRule(rule.id, userId, eventType, properties)
        }
      }
    }
  } catch (error) {
    console.error("Error checking automation triggers:", error)
  }
}

async function evaluateConditions(userId: string, conditions: any, properties?: any): Promise<boolean> {
  // This would contain complex condition evaluation logic
  // For now, return true as a placeholder
  return true
}

async function executeAutomationRule(ruleId: string, userId: string, trigger: string, properties?: any) {
  try {
    const rule = await prisma.automationRule.findUnique({
      where: { id: ruleId },
    })

    if (!rule) return

    const actions = rule.actions as any[]

    for (const action of actions) {
      await executeAction(action, userId, ruleId)
    }

    // Log execution
    await prisma.automationExecution.create({
      data: {
        ruleId,
        userId,
        trigger,
        status: "COMPLETED",
        result: { actionsExecuted: actions.length },
      },
    })

    // Update rule statistics
    await prisma.automationRule.update({
      where: { id: ruleId },
      data: {
        totalExecutions: { increment: 1 },
        successfulExecutions: { increment: 1 },
      },
    })
  } catch (error) {
    console.error("Error executing automation rule:", error)

    // Log failed execution
    await prisma.automationExecution.create({
      data: {
        ruleId,
        userId,
        trigger,
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    })

    await prisma.automationRule.update({
      where: { id: ruleId },
      data: {
        totalExecutions: { increment: 1 },
        failedExecutions: { increment: 1 },
      },
    })
  }
}

async function executeAction(action: any, userId: string, ruleId: string) {
  switch (action.type) {
    case "SEND_NOTIFICATION":
      await prisma.notification.create({
        data: {
          userId,
          title: action.title,
          message: action.message,
          type: action.notificationType || "SYSTEM",
          data: { automationRuleId: ruleId },
        },
      })
      break

    case "ADD_TO_SEGMENT":
      await prisma.customerSegmentMember.upsert({
        where: {
          segmentId_userId: {
            segmentId: action.segmentId,
            userId,
          },
        },
        update: { isActive: true },
        create: {
          segmentId: action.segmentId,
          userId,
        },
      })
      break

    case "AWARD_POINTS":
      await prisma.loyaltyTransaction.create({
        data: {
          userId,
          type: "EARNED",
          points: action.points,
          description: action.description || "Automation reward",
        },
      })
      break

    // Add more action types as needed
  }
}
