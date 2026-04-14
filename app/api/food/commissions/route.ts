import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get commission settings for FOOD module
    const commissionSettings = await prisma.commissionSetting.findMany({
      where: {
        module: "FOOD",
        isActive: true,
      },
    })

    // Format as a map for easy access
    const commissions: any = {}
    commissionSettings.forEach((setting) => {
      commissions[setting.commissionType] = {
        rate: setting.rate,
        minAmount: setting.minAmount,
        maxAmount: setting.maxAmount,
      }
    })

    // Get PLATFORM_FEE specifically
    const platformFee = commissions.PLATFORM_FEE || { rate: 8.0, minAmount: 15, maxAmount: 800 }

    return NextResponse.json({
      platformFee,
    })
  } catch (error) {
    console.error("Commission settings fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch commission settings" }, { status: 500 })
  }
}
