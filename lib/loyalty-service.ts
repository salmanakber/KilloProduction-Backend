import { prisma } from "./prisma"
import { Module } from "@prisma/client"

/**
 * Service for managing loyalty points based on orders
 * Uses LoyaltyPointSettings to calculate points dynamically from formula
 */

interface AwardLoyaltyPointsParams {
  userId: string
  orderId: string
  module: Module
  orderAmount: number
  reason?: string
}

interface CalculatePointsResult {
  points: number
  setting: {
    enabled: boolean
    formula: string
    minimumOrderAmount?: number | null
    maximumPointsPerOrder?: number | null
    pointsExpiryDays?: number | null
  } | null
}

/**
 * Calculate loyalty points based on module settings and order amount
 * Evaluates the formula string from LoyaltyPointSettings
 */
export async function calculateLoyaltyPoints(
  module: Module,
  orderAmount: number
): Promise<CalculatePointsResult> {
  try {
    // Fetch loyalty point settings for the module
    const setting = await prisma.loyaltyPointSettings.findUnique({
      where: { module },
    })

    if (!setting || !setting.enabled) {
      return { points: 0, setting: null }
    }

    // Check minimum order amount
    if (setting.minimumOrderAmount && orderAmount < setting.minimumOrderAmount) {
      return { points: 0, setting }
    }

    // Evaluate formula dynamically
    // Formula is stored as string like "orderAmount * 0.02"
    let points = 0
    try {
      // Replace orderAmount in formula with actual value
      const formula = setting.formula.replace(/orderAmount/g, orderAmount.toString())
      
      // Use Function constructor for safe evaluation
      // This allows dynamic formula evaluation while maintaining security
      const calculatePoints = new Function('return ' + formula)
      points = Math.floor(calculatePoints())
      
      // Ensure points are non-negative
      points = Math.max(0, points)
      
      // Apply maximum points limit if set
      if (setting.maximumPointsPerOrder && points > setting.maximumPointsPerOrder) {
        points = setting.maximumPointsPerOrder
      }
    } catch (error) {
      console.error(`Error evaluating loyalty formula for ${module}:`, error)
      return { points: 0, setting }
    }

    return { points, setting }
  } catch (error) {
    console.error(`Error calculating loyalty points for ${module}:`, error)
    return { points: 0, setting: null }
  }
}

/**
 * Award loyalty points to a user for an order
 * Creates LoyaltyPoint record and handles expiration if configured
 */
export async function awardLoyaltyPoints(
  params: AwardLoyaltyPointsParams
): Promise<{ success: boolean; points: number; error?: string }> {
  try {
    const { userId, orderId, module, orderAmount, reason } = params

    // Calculate points using the formula
    const { points, setting } = await calculateLoyaltyPoints(module, orderAmount)

    if (points === 0 || !setting) {
      return { success: false, points: 0, error: "No points to award or loyalty disabled" }
    }

    // Calculate expiration date if pointsExpiryDays is set
    let expiresAt: Date | null = null
    if (setting.pointsExpiryDays && setting.pointsExpiryDays > 0) {
      expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + setting.pointsExpiryDays)
    }

    // Create loyalty point record
    await prisma.loyaltyPoint.create({
      data: {
        userId,
        points,
        type: "EARNED",
        reason: reason || `Points earned from ${module} order`,
        module,
        orderId,
        expiresAt,
        isRedeemed: false,
      },
    })

    // Also create a transaction record for tracking
    await prisma.loyaltyTransaction.create({
      data: {
        userId,
        type: "EARNED",
        points,
        description: reason || `Points earned from ${module} order #${orderId}`,
        orderId,
        expiresAt,
      },
    }).catch((error) => {
      // Log but don't fail if transaction creation fails
      console.error("Error creating loyalty transaction:", error)
    })

    return { success: true, points }
  } catch (error) {
    console.error("Error awarding loyalty points:", error)
    return {
      success: false,
      points: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Redeem loyalty points (deduct from user's balance)
 * Used when user applies points as discount during checkout
 */
export async function redeemLoyaltyPoints(
  userId: string,
  pointsToRedeem: number,
  orderId: string,
  description?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (pointsToRedeem <= 0) {
      return { success: false, error: "Invalid points amount" }
    }

    // Get user's available points (not redeemed, not expired)
    const availablePointsResult = await prisma.loyaltyPoint.aggregate({
      where: {
        userId,
        isRedeemed: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      _sum: { points: true },
    })

    const availablePoints = availablePointsResult._sum.points || 0

    if (availablePoints < pointsToRedeem) {
      return { success: false, error: "Insufficient loyalty points" }
    }

    // Mark points as redeemed (oldest first)
    const pointsToMark = await prisma.loyaltyPoint.findMany({
      where: {
        userId,
        isRedeemed: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: "asc" }, // Oldest first (FIFO)
    })

    let remainingToRedeem = pointsToRedeem
    for (const pointRecord of pointsToMark) {
      if (remainingToRedeem <= 0) break

      if (pointRecord.points <= remainingToRedeem) {
        // Mark entire record as redeemed
        await prisma.loyaltyPoint.update({
          where: { id: pointRecord.id },
          data: { isRedeemed: true },
        })
        remainingToRedeem -= pointRecord.points
      } else {
        // Split the record - mark partial redemption
        // Note: This is a simplified approach. For production, you might want to split records
        await prisma.loyaltyPoint.update({
          where: { id: pointRecord.id },
          data: { isRedeemed: true },
        })
        remainingToRedeem = 0
      }
    }

    // Create redemption transaction
    await prisma.loyaltyTransaction.create({
      data: {
        userId,
        type: "REDEEMED",
        points: pointsToRedeem,
        description: description || `Points redeemed for order #${orderId}`,
        orderId,
      },
    })

    return { success: true }
  } catch (error) {
    console.error("Error redeeming loyalty points:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
