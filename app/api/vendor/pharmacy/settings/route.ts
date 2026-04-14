import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: session.id }
    })

    if (!userSettings) {
      // Create default settings if none exist
      const defaultSettings = await prisma.userSettings.create({
        data: {
          userId: session.id,
          pushNotifications: true,
          emailNotifications: true,
          smsNotifications: true,
          locationTracking: true,
          currency: 'NGN',
          theme: 'light',
        }
      })
      return NextResponse.json(defaultSettings)
    }

    return NextResponse.json(userSettings)
  } catch (error) {
    console.error('Error fetching settings:', error)
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
    const {
      pushNotifications,
      emailNotifications,
      smsNotifications,
      locationTracking,
      currency,
      theme,
      deliveryInstructions
    } = body

    const updatedSettings = await prisma.userSettings.upsert({
      where: { userId: session.id },
      update: {
        pushNotifications,
        emailNotifications,
        smsNotifications,
        locationTracking,
        currency,
        theme,
        deliveryInstructions,
      },
      create: {
        userId: session.id,
        pushNotifications: pushNotifications ?? true,
        emailNotifications: emailNotifications ?? true,
        smsNotifications: smsNotifications ?? true,
        locationTracking: locationTracking ?? true,
        currency: currency ?? 'NGN',
        theme: theme ?? 'light',
        deliveryInstructions,
      }
    })

    return NextResponse.json(updatedSettings)
  } catch (error) {
    console.error('Error updating settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
