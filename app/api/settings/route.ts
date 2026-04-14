import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    console.log("GET /api/settings")
    const user = await authenticateRequest(request)
    
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get system settings (singleton)
    const systemSettings = await prisma.systemSettings.findUnique({
      where: { id: 1 },
    })

    // Get user settings
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    })

    return NextResponse.json({
      success: true,
      data: {
        systemSettings: systemSettings || null,
        userSettings: userSettings || null,
      },
    })
  } catch (error) {
    console.error("Error fetching settings:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch settings",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
      deliveryInstructions,
      deviceTokens,
    } = body

    // Update or create user settings
    const updatedSettings = await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: {
        ...(pushNotifications !== undefined && { pushNotifications }),
        ...(emailNotifications !== undefined && { emailNotifications }),
        ...(smsNotifications !== undefined && { smsNotifications }),
        ...(locationTracking !== undefined && { locationTracking }),
        ...(dataSharing !== undefined && { dataSharing }),
        ...(language !== undefined && { language }),
        ...(currency !== undefined && { currency }),
        ...(theme !== undefined && { theme }),
        ...(autoReorder !== undefined && { autoReorder }),
        ...(deliveryInstructions !== undefined && { deliveryInstructions }),
        ...(deviceTokens !== undefined && { deviceTokens }),
      },
      create: {
        userId: user.id,
        pushNotifications: pushNotifications ?? true,
        emailNotifications: emailNotifications ?? true,
        smsNotifications: smsNotifications ?? true,
        locationTracking: locationTracking ?? true,
        dataSharing: dataSharing ?? false,
        language: language ?? "en",
        currency: currency ?? "NGN",
        theme: theme ?? "light",
        autoReorder: autoReorder ?? false,
        deliveryInstructions,
        deviceTokens,
      },
    })

    return NextResponse.json({
      success: true,
      data: updatedSettings,
    })
  } catch (error) {
    console.error("Error updating user settings:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update settings",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
