import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from "@/lib/auth"
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)

    console.log('session', session)
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!session) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get user's saved payment methods
    const paymentMethods = await prisma.paymentMethod.findMany({
      where: {
        userId: session?.id,
        isActive: true
      },
      select: {
        id: true,
        type: true,
        last4: true, // TODO: Change to lastFour from last4
        brand: true, // TODO: Change to brand from last4
        expiryMonth: true,
        expiryYear: true,
        isDefault: true,
        provider: true,
        token: true,
        gatewayPaymentMethodId: true,
        gateway: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ]
    })

    return NextResponse.json({
      success: true,
      data: paymentMethods
    })

  } catch (error: any) {
    console.error('Error fetching payment methods:', error)
    return NextResponse.json({
      error: error.message || 'Failed to fetch payment methods'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
  
    const session = await authenticateRequest(request)
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!session?.id) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      type, 
      last4, 
      brand, 
      expiryMonth, 
      expiryYear, 
      gateway, 
      gatewayPaymentMethodId,
      isDefault = false 
    } = body

    // Validate required fields
    if (!type || !last4 || !brand || !gateway || !gatewayPaymentMethodId) {
      return NextResponse.json({ 
        error: 'Missing required fields: type, last4, brand, gateway, gatewayPaymentMethodId' 
      }, { status: 400 })
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.paymentMethod.updateMany({
        where: {
          userId: payload.userId,
          isDefault: true
        },
        data: {
          isDefault: false
        }
      })
    }

    // Create new payment method
    const paymentMethod = await prisma.paymentMethod.create({
      data: {
        userId: session.id,
        type,
        last4,
        brand,
        expiryMonth,
        expiryYear,
        gateway,
        gatewayPaymentMethodId,
        isDefault,
        isActive: true
      },
      select: {
        id: true,
        type: true,
        last4: true,
        brand: true,
        expiryMonth: true,
        expiryYear: true,
        isDefault: true,
        createdAt: true
      }
    })

    return NextResponse.json({
      success: true,
      data: paymentMethod
    })

  } catch (error: any) {
    console.error('Error creating payment method:', error)
    return NextResponse.json({
      error: error.message || 'Failed to create payment method'
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!session?.id) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const paymentMethodId = searchParams.get('id')

    if (!paymentMethodId) {
      return NextResponse.json({ error: 'Payment method ID is required' }, { status: 400 })
    }

    // Soft delete payment method
    await prisma.paymentMethod.update({
      where: {
        id: paymentMethodId,
        userId: payload.userId // Ensure user can only delete their own payment methods
      },
      data: {
        isActive: false
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Payment method deleted successfully'
    })

  } catch (error: any) {
    console.error('Error deleting payment method:', error)
    return NextResponse.json({
      error: error.message || 'Failed to delete payment method'
    }, { status: 500 })
  }
}

