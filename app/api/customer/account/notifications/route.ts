import { authenticateRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: session.id },
    })

    // Return default settings if none exist
    const settings = userSettings || {
      pushNotifications: true,
      emailNotifications: true,
      smsNotifications: true,
      locationTracking: true,
      dataSharing: false,
      language: 'en',
      currency: 'USD',
      theme: 'light',
      autoReorder: false,
    }

    return NextResponse.json({
      success: true,
      data: {
        orderUpdates: settings.pushNotifications,
        promotions: settings.emailNotifications,
        newsletter: settings.smsNotifications,
      },
    })
  } catch (error) {
    console.error('Error fetching notification settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { orderUpdates, promotions, newsletter } = body

    // Map the frontend field names to the database field names
    const updateData: any = {}
    if (orderUpdates !== undefined) updateData.pushNotifications = orderUpdates
    if (promotions !== undefined) updateData.emailNotifications = promotions
    if (newsletter !== undefined) updateData.smsNotifications = newsletter

    const userSettings = await prisma.userSettings.upsert({
      where: { userId: session.id },
      update: updateData,
      create: {
        userId: session.id,
        pushNotifications: orderUpdates !== undefined ? orderUpdates : true,
        emailNotifications: promotions !== undefined ? promotions : true,
        smsNotifications: newsletter !== undefined ? newsletter : true,
        locationTracking: true,
        dataSharing: false,
        language: 'en',
        currency: 'USD',
        theme: 'light',
        autoReorder: false,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Notification settings updated successfully',
      data: {
        orderUpdates: userSettings.pushNotifications,
        promotions: userSettings.emailNotifications,
        newsletter: userSettings.smsNotifications,
      },
    })
  } catch (error) {
    console.error('Error updating notification settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
