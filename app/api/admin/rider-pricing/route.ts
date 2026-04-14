import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get all rider pricing settings
    const pricingSettings = await prisma.commissionSetting.findMany({
      where: {
        commissionType: "RIDER_COMMISSION",
        isActive: true
      },
      orderBy: {
        module: "asc"
      }
    })

    return NextResponse.json({
      pricingSettings,
      message: "Rider pricing settings retrieved successfully"
    })
  } catch (error) {
    console.error("Rider pricing fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch rider pricing" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { module, rate, minAmount, maxAmount, description } = body

    if (!module || !rate) {
      return NextResponse.json({ 
        error: "Module and rate are required" 
      }, { status: 400 })
    }

    // Check if setting already exists
    const existingSetting = await prisma.commissionSetting.findFirst({
      where: {
        module,
        commissionType: "RIDER_COMMISSION"
      }
    })

    let pricingSetting

    if (existingSetting) {
      // Update existing setting
      pricingSetting = await prisma.commissionSetting.update({
        where: { id: existingSetting.id },
        data: {
          rate: parseFloat(rate),
          minAmount: minAmount ? parseFloat(minAmount) : null,
          maxAmount: maxAmount ? parseFloat(maxAmount) : null,
          description: description || null,
          isActive: true
        }
      })
    } else {
      // Create new setting
      pricingSetting = await prisma.commissionSetting.create({
        data: {
          module,
          commissionType: "RIDER_COMMISSION",
          rate: parseFloat(rate),
          minAmount: minAmount ? parseFloat(minAmount) : null,
          maxAmount: maxAmount ? parseFloat(maxAmount) : null,
          description: description || null,
          isActive: true
        }
      })
    }

    return NextResponse.json({
      pricingSetting,
      message: "Rider pricing setting saved successfully"
    }, { status: 201 })
  } catch (error) {
    console.error("Rider pricing save error:", error)
    return NextResponse.json({ error: "Failed to save rider pricing" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { id, rate, minAmount, maxAmount, description, isActive } = body

    if (!id) {
      return NextResponse.json({ error: "Setting ID is required" }, { status: 400 })
    }

    const pricingSetting = await prisma.commissionSetting.update({
      where: { id },
      data: {
        rate: rate ? parseFloat(rate) : undefined,
        minAmount: minAmount ? parseFloat(minAmount) : null,
        maxAmount: maxAmount ? parseFloat(maxAmount) : null,
        description: description || null,
        isActive: isActive !== undefined ? isActive : undefined
      }
    })

    return NextResponse.json({
      pricingSetting,
      message: "Rider pricing setting updated successfully"
    })
  } catch (error) {
    console.error("Rider pricing update error:", error)
    return NextResponse.json({ error: "Failed to update rider pricing" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Setting ID is required" }, { status: 400 })
    }

    // Soft delete by setting isActive to false
    await prisma.commissionSetting.update({
      where: { id },
      data: { isActive: false }
    })

    return NextResponse.json({
      message: "Rider pricing setting deleted successfully"
    })
  } catch (error) {
    console.error("Rider pricing delete error:", error)
    return NextResponse.json({ error: "Failed to delete rider pricing" }, { status: 500 })
  }
}
