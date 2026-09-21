import { authenticateRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREF_KEYS,
  normalizeNotificationPreferences,
  type NotificationPrefKey,
} from '@/lib/notification-preferences'
import { NextRequest, NextResponse } from 'next/server'

function buildResponsePayload(userSettings: {
  pushNotifications: boolean
  emailNotifications: boolean
  smsNotifications: boolean
  notificationPreferences: unknown
} | null) {
  const prefs = normalizeNotificationPreferences(userSettings?.notificationPreferences)
  return {
    pushNotifications: userSettings?.pushNotifications ?? true,
    emailNotifications: userSettings?.emailNotifications ?? true,
    smsNotifications: userSettings?.smsNotifications ?? true,
    // Legacy AccountScreen keys (kept for older clients)
    orderUpdates: prefs.orders,
    promotions: prefs.promotions,
    newsletter: userSettings?.emailNotifications ?? true,
    preferences: prefs,
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: session.id },
    })

    return NextResponse.json({
      success: true,
      data: buildResponsePayload(userSettings),
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
    const {
      orderUpdates,
      promotions,
      newsletter,
      pushNotifications,
      emailNotifications,
      smsNotifications,
      preferences,
    } = body

    const existing = await prisma.userSettings.findUnique({
      where: { userId: session.id },
    })
    const currentPrefs = normalizeNotificationPreferences(existing?.notificationPreferences)

    const nextPrefs = { ...currentPrefs }
    if (preferences && typeof preferences === 'object') {
      for (const key of NOTIFICATION_PREF_KEYS) {
        if (typeof preferences[key] === 'boolean') {
          nextPrefs[key as NotificationPrefKey] = preferences[key]
        }
      }
    }
    // Legacy single toggles from AccountScreen
    if (typeof orderUpdates === 'boolean') nextPrefs.orders = orderUpdates
    if (typeof promotions === 'boolean') nextPrefs.promotions = promotions

    const updateData: Record<string, unknown> = {
      notificationPreferences: nextPrefs,
    }
    if (typeof pushNotifications === 'boolean') updateData.pushNotifications = pushNotifications
    if (typeof emailNotifications === 'boolean') updateData.emailNotifications = emailNotifications
    if (typeof smsNotifications === 'boolean') updateData.smsNotifications = smsNotifications
    if (typeof newsletter === 'boolean') updateData.emailNotifications = newsletter

    const userSettings = await prisma.userSettings.upsert({
      where: { userId: session.id },
      update: updateData,
      create: {
        userId: session.id,
        pushNotifications: typeof pushNotifications === 'boolean' ? pushNotifications : true,
        emailNotifications:
          typeof emailNotifications === 'boolean'
            ? emailNotifications
            : typeof newsletter === 'boolean'
              ? newsletter
              : true,
        smsNotifications: typeof smsNotifications === 'boolean' ? smsNotifications : true,
        locationTracking: true,
        dataSharing: false,
        language: 'en',
        currency: 'NGN',
        theme: 'light',
        autoReorder: false,
        notificationPreferences: nextPrefs,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Notification settings updated successfully',
      data: buildResponsePayload(userSettings),
    })
  } catch (error) {
    console.error('Error updating notification settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Exported for tests / reuse */
export const _defaults = DEFAULT_NOTIFICATION_PREFERENCES
