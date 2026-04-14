import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const promoCodes = await prisma.promoCode.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        usages: {
          take: 5,
          orderBy: { createdAt: "desc" },
        },
      },
    })

    return NextResponse.json({ promoCodes })
  } catch (error) {
    console.error("Error fetching promo codes:", error)
    return NextResponse.json({ error: "Failed to fetch promo codes" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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

    // Check if code already exists
    const existing = await prisma.promoCode.findUnique({
      where: { code: code.toUpperCase() },
    })

    if (existing) {
      return NextResponse.json({ error: "Promo code already exists" }, { status: 400 })
    }

    const promoCode = await prisma.promoCode.create({
      data: {
        code: code.toUpperCase(),
        title,
        description,
        type,
        value,
        minOrderAmount,
        maxDiscount,
        usageLimit,
        modules: modules || null,
        isActive,
        startsAt: new Date(startsAt),
        expiresAt: new Date(expiresAt),
      },
    })

    return NextResponse.json({ promoCode })
  } catch (error) {
    console.error("Error creating promo code:", error)
    return NextResponse.json({ error: "Failed to create promo code" }, { status: 500 })
  }
}

