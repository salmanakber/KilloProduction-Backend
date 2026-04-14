import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { userType: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userType } = params

    // Validate user type
    const validUserTypes = ['pharmacy', 'wholesaler', 'rider', 'admin']
    if (!validUserTypes.includes(userType)) {
      return NextResponse.json({ error: 'Invalid user type' }, { status: 400 })
    }

    // Check if user has the appropriate role
    if (session.role !== userType.toUpperCase() && session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
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
          dataSharing: false,
          language: 'en',
          currency: 'NGN',
          theme: 'light',
          autoReorder: false,
          deliveryInstructions: null,
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

export async function PUT(
  request: NextRequest,
  { params }: { params: { userType: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userType } = params

    // Validate user type
    const validUserTypes = ['pharmacy', 'wholesaler', 'rider', 'admin']
    if (!validUserTypes.includes(userType)) {
      return NextResponse.json({ error: 'Invalid user type' }, { status: 400 })
    }

    // Check if user has the appropriate role
    if (session.role !== userType.toUpperCase() && session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const {
      pushNotifications,
      emailNotifications,
      smsNotifications,
      locationTracking,
      dataSharing,
      language,
      currency,
      theme,
      autoReorder,
      deliveryInstructions
    } = body

    // Validate theme
    const validThemes = ['light', 'dark', 'auto']
    if (theme && !validThemes.includes(theme)) {
      return NextResponse.json({ error: 'Invalid theme' }, { status: 400 })
    }

    // Validate language
    const validLanguages = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'ar', 'hi']
    if (language && !validLanguages.includes(language)) {
      return NextResponse.json({ error: 'Invalid language' }, { status: 400 })
    }

    const updatedSettings = await prisma.userSettings.upsert({
      where: { userId: session.id },
      update: {
        pushNotifications,
        emailNotifications,
        smsNotifications,
        locationTracking,
        dataSharing,
        language,
        currency,
        theme,
        autoReorder,
        deliveryInstructions,
      },
      create: {
        userId: session.id,
        pushNotifications: pushNotifications ?? true,
        emailNotifications: emailNotifications ?? true,
        smsNotifications: smsNotifications ?? true,
        locationTracking: locationTracking ?? true,
        dataSharing: dataSharing ?? false,
        language: language ?? 'en',
        currency: currency ?? 'NGN',
        theme: theme ?? 'light',
        autoReorder: autoReorder ?? false,
        deliveryInstructions,
      }
    })

    return NextResponse.json(updatedSettings)
  } catch (error) {
    console.error('Error updating settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
