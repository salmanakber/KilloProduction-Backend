import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const { module, orderAmount, commissionType } = data

    // Get commission setting for the module and type
    const commissionSetting = await prisma.commissionSetting.findUnique({
      where: {
        module_commissionType: {
          module,
          commissionType,
        },
        isActive: true,
      },
    })

    if (!commissionSetting) {
      return NextResponse.json({ error: "Commission setting not found" }, { status: 404 })
    }

    // Calculate commission amount
    let commissionAmount = (orderAmount * commissionSetting.rate) / 100

    // Apply min/max limits
    if (commissionSetting.minAmount && commissionAmount < commissionSetting.minAmount) {
      commissionAmount = commissionSetting.minAmount
    }

    if (commissionSetting.maxAmount && commissionAmount > commissionSetting.maxAmount) {
      commissionAmount = commissionSetting.maxAmount
    }

    return NextResponse.json({
      commissionRate: commissionSetting.rate,
      commissionAmount,
      minAmount: commissionSetting.minAmount,
      maxAmount: commissionSetting.maxAmount,
    })
  } catch (error) {
    console.error("Commission calculation error:", error)
    return NextResponse.json({ error: "Failed to calculate commission" }, { status: 500 })
  }
}
