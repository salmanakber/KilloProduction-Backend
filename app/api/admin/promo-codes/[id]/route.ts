import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const promoCode = await prisma.promoCode.findUnique({
      where: { id: params.id },
      include: {
        usages: {
          include: {
            order: {
              select: {
                id: true,
                totalAmount: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    })

    if (!promoCode) {
      return NextResponse.json({ error: "Promo code not found" }, { status: 404 })
    }

    return NextResponse.json({ promoCode })
  } catch (error) {
    console.error("Error fetching promo code:", error)
    return NextResponse.json({ error: "Failed to fetch promo code" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      code,
      title,
      description,
      type,
      value,
      minOrderAmount,
      maxDiscount,
      usageLimit,
      modules,
      isActive,
      startsAt,
      expiresAt,
    } = body

    // If code is being changed, check if new code exists
    if (code) {
      const existing = await prisma.promoCode.findUnique({
        where: { code: code.toUpperCase() },
      })

      if (existing && existing.id !== params.id) {
        return NextResponse.json({ error: "Promo code already exists" }, { status: 400 })
      }
    }

    const updateData: any = {}
    if (code) updateData.code = code.toUpperCase()
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (type) updateData.type = type
    if (value !== undefined) updateData.value = value
    if (minOrderAmount !== undefined) updateData.minOrderAmount = minOrderAmount
    if (maxDiscount !== undefined) updateData.maxDiscount = maxDiscount
    if (usageLimit !== undefined) updateData.usageLimit = usageLimit
    if (modules !== undefined) updateData.modules = modules
    if (isActive !== undefined) updateData.isActive = isActive
    if (startsAt) updateData.startsAt = new Date(startsAt)
    if (expiresAt) updateData.expiresAt = new Date(expiresAt)

    const promoCode = await prisma.promoCode.update({
      where: { id: params.id },
      data: updateData,
    })

    return NextResponse.json({ promoCode })
  } catch (error) {
    console.error("Error updating promo code:", error)
    return NextResponse.json({ error: "Failed to update promo code" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await prisma.promoCode.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ message: "Promo code deleted successfully" })
  } catch (error) {
    console.error("Error deleting promo code:", error)
    return NextResponse.json({ error: "Failed to delete promo code" }, { status: 500 })
  }
}


