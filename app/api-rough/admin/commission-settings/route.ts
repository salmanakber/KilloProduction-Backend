import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const module = searchParams.get("module")

    const where: any = {
      isActive: true,
    }

    if (module) {
      where.module = module
    }

    const commissionSettings = await prisma.commissionSetting.findMany({
      where,
      orderBy: [{ module: "asc" }, { commissionType: "asc" }],
    })

    return NextResponse.json({ commissionSettings })
  } catch (error) {
    console.error("Commission settings fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch commission settings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    const { module, commissionType, rate, minAmount, maxAmount, description } = data

    // Check if setting already exists
    const existingSetting = await prisma.commissionSetting.findUnique({
      where: {
        module_commissionType: {
          module,
          commissionType,
        },
      },
    })

    if (existingSetting) {
      return NextResponse.json({ error: "Commission setting already exists for this module and type" }, { status: 400 })
    }

    const commissionSetting = await prisma.commissionSetting.create({
      data: {
        module,
        commissionType,
        rate,
        minAmount,
        maxAmount,
        description,
      },
    })

    return NextResponse.json(commissionSetting, { status: 201 })
  } catch (error) {
    console.error("Commission setting creation error:", error)
    return NextResponse.json({ error: "Failed to create commission setting" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    const { id, rate, minAmount, maxAmount, description, isActive } = data

    const commissionSetting = await prisma.commissionSetting.update({
      where: { id },
      data: {
        rate,
        minAmount,
        maxAmount,
        description,
        isActive,
      },
    })

    return NextResponse.json(commissionSetting)
  } catch (error) {
    console.error("Commission setting update error:", error)
    return NextResponse.json({ error: "Failed to update commission setting" }, { status: 500 })
  }
}
