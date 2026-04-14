import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    // Get Money Transfer Stripe config (separate from marketplace)
    const config = await prisma.moneyTransferConfig.findFirst()

    // Return publishable key (safe to expose)
    let publishableKey = config?.stripePublishableKey || process.env.MONEY_TRANSFER_STRIPE_PUBLISHABLE_KEY

    // Fallback to marketplace Stripe if Money Transfer Stripe not configured
    // This ensures Payment Intent can be accessed by the mobile app
    if (!publishableKey) {
      const settings = await prisma.systemSettings.findFirst({
        where: { id: 1 },
        select: { paymentMethods: true },
      })

      if (settings?.paymentMethods) {
        const paymentMethodsData = settings.paymentMethods as any
        const marketplaceStripe = paymentMethodsData.stripe
        publishableKey = marketplaceStripe?.publishableKey || process.env.STRIPE_PUBLISHABLE_KEY
      }
    }

    if (!publishableKey) {
      return NextResponse.json(
        { error: "Stripe publishable key not configured. Please configure Money Transfer Stripe keys in admin panel." },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        publishableKey,
        merchantDisplayName: "SuperKillo Money Transfer",
        isConfigured: true,
      },
    })
  } catch (error: any) {
    console.error("Error fetching Money Transfer Stripe config:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch Stripe configuration" },
      { status: 500 }
    )
  }
}
