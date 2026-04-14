import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Get payment gateway settings from database.
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const settings = await prisma.systemSettings.findFirst({
      where: { id: 1 },
      select: { paymentMethods: true },
    })

    if (!settings?.paymentMethods) {
      return NextResponse.json({
        success: false,
        error: 'Payment gateway settings not found'
      }, { status: 404 })
    }

    const paymentMethodsData = settings.paymentMethods as any
    const stripeConfig = paymentMethodsData.stripe

    if (!stripeConfig?.publishableKey) {
      return NextResponse.json({
        success: false,
        error: 'Stripe publishable key not configured'
      }, { status: 404 })
    }

    // Return only the publishable key (safe to expose to client)
    return NextResponse.json({
      success: true,
      data: {
        publishableKey: stripeConfig.publishableKey,
        merchantDisplayName: stripeConfig.merchantDisplayName || 'SuperKillo',
        // Add other safe-to-expose Stripe config here
      }
    })

  } catch (error: any) {
    console.error('Error fetching Stripe config:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch Stripe configuration'
    }, { status: 500 })
  }
}
