import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { code, orderAmount, module } = await request.json()

    if (!code || !orderAmount || !module) {
      return NextResponse.json({ 
        success: false, 
        error: "Missing required fields: code, orderAmount, module" 
      }, { status: 400 })
    }

    const promoCode = await prisma.promoCode.findUnique({
      where: { code: code.toUpperCase() },
    })

    if (!promoCode) {
      return NextResponse.json({ success: false, error: "Invalid promo code" }, { status: 404 })
    }

    if (!promoCode.isActive) {
      return NextResponse.json({ success: false, error: "Promo code is inactive" }, { status: 400 })
    }

    const now = new Date()
    if (now < promoCode.startsAt || now > promoCode.expiresAt) {
      return NextResponse.json({ 
        success: false, 
        error: "Promo code is not active yet or has expired" 
      }, { status: 400 })
    }

    if (promoCode.usageLimit && promoCode.usedCount >= promoCode.usageLimit) {
      return NextResponse.json({ 
        success: false, 
        error: "Promo code usage limit reached" 
      }, { status: 400 })
    }

    if (promoCode.minOrderAmount && orderAmount < promoCode.minOrderAmount) {
      return NextResponse.json({ 
        success: false, 
        error: `Minimum order amount of ${promoCode.minOrderAmount} not met` 
      }, { status: 400 })
    }

    // Check if promo code is applicable for the module
    const applicableModules = promoCode.modules as string[] | null
    if (applicableModules && applicableModules.length > 0 && !applicableModules.includes(module)) {
      return NextResponse.json({ 
        success: false, 
        error: `Promo code is not applicable for ${module} module` 
      }, { status: 400 })
    }

    // Calculate discount amount
    let discountAmount = 0
    if (promoCode.type === "PERCENTAGE") {
      discountAmount = orderAmount * (promoCode.value / 100)
      if (promoCode.maxDiscount && discountAmount > promoCode.maxDiscount) {
        discountAmount = promoCode.maxDiscount
      }
    } else if (promoCode.type === "FIXED_AMOUNT") {
      discountAmount = promoCode.value
    } else if (promoCode.type === "FREE_DELIVERY") {
      // For free delivery, the discount amount might be handled differently on the frontend
      // For now, we can return a symbolic value or 0 and let frontend handle it.
      discountAmount = 0 // Assuming delivery fee is not part of orderAmount for now
    }

    const finalAmount = Math.max(0, orderAmount - discountAmount)

    return NextResponse.json({
      success: true,
      data: {
        promoCode,
        discountAmount,
        finalAmount,
      },
    })
  } catch (error) {
    console.error("Error validating promo code:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to validate promo code", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    )
  }
}



