import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get loyalty point settings
    const loyaltyPointSettings = await prisma.loyaltyPointSettings.findMany()
    
    // Map module names from database enum to frontend format
    const moduleMap: Record<string, string> = {
      PHARMACY: "pharmacy",
      AUTO_PARTS: "autoParts",
      FOOD: "food",
      GROCERY: "grocery",
      RIDING: "riding",
    }
    
    const loyaltyPointsMap: Record<string, any> = {}
    loyaltyPointSettings.forEach((setting) => {
      const moduleKey = moduleMap[setting.module] || setting.module.toLowerCase()
      loyaltyPointsMap[moduleKey] = {
        enabled: setting.enabled,
        formula: setting.formula,
        minimumOrderAmount: setting.minimumOrderAmount,
        maximumPointsPerOrder: setting.maximumPointsPerOrder,
        pointsExpiryDays: setting.pointsExpiryDays,
      }
    })

    return NextResponse.json({
      success: true,
      data: loyaltyPointsMap,
    })
  } catch (error) {
    console.error("Error fetching loyalty point settings:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch loyalty point settings",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

