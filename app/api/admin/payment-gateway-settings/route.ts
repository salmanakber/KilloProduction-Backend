import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from "@/lib/auth"
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { role: true }
    })

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    // Get payment gateway settings
    const settings = await prisma.settings.findFirst({
      where: { id: "default" },
      select: { paymentMethods: true }
    })

    return NextResponse.json({
      success: true,
      data: settings?.paymentMethods || {}
    })

  } catch (error: any) {
    console.error('Error fetching payment gateway settings:', error)
    return NextResponse.json({
      error: error.message || 'Failed to fetch payment gateway settings'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { role: true }
    })

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const { stripe, paystack, firstmonie } = body

    // Validate required fields
    const paymentMethodsConfig = {
      stripe: {
        secretKey: stripe?.secretKey || '',
        publishableKey: stripe?.publishableKey || '',
        webhookSecret: stripe?.webhookSecret || ''
      },
      paystack: {
        secretKey: paystack?.secretKey || '',
        publicKey: paystack?.publicKey || ''
      },
      firstmonie: {
        secretKey: firstmonie?.secretKey || '',
        publicKey: firstmonie?.publicKey || ''
      }
    }

    // Update or create settings
    await prisma.settings.upsert({
      where: { id: "default" },
      update: {
        paymentMethods: paymentMethodsConfig
      },
      create: {
        id: "default",
        paymentMethods: paymentMethodsConfig
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Payment gateway settings updated successfully'
    })

  } catch (error: any) {
    console.error('Error updating payment gateway settings:', error)
    return NextResponse.json({
      error: error.message || 'Failed to update payment gateway settings'
    }, { status: 500 })
  }
}


