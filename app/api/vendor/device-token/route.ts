import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { deviceToken, platform } = await request.json()

    if (!deviceToken) {
      return NextResponse.json({ error: "Device token is required" }, { status: 400 })
    }

    // Get or create user settings
    let userSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id }
    })

    if (!userSettings) {
      userSettings = await prisma.userSettings.create({
        data: {
          userId: user.id,
          pushNotifications: true,
          deviceTokens: [deviceToken]
        }
      })
    } else {
      // Add device token if not already present
      const currentTokens = Array.isArray(userSettings.deviceTokens) 
        ? userSettings.deviceTokens 
        : []
      
      if (!currentTokens.includes(deviceToken)) {
        await prisma.userSettings.update({
          where: { userId: user.id },
          data: {
            deviceTokens: [...currentTokens, deviceToken]
          }
        })
      }
    }

    return NextResponse.json({ 
      message: "Device token registered successfully",
      deviceToken 
    })
  } catch (error) {
    console.error("Device token registration error:", error)
    return NextResponse.json({ error: "Failed to register device token" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const deviceToken = searchParams.get("token")

    if (!deviceToken) {
      return NextResponse.json({ error: "Device token is required" }, { status: 400 })
    }

    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id }
    })

    if (userSettings && Array.isArray(userSettings.deviceTokens)) {
      const updatedTokens = userSettings.deviceTokens.filter(token => token !== deviceToken)
      
      await prisma.userSettings.update({
        where: { userId: user.id },
        data: {
          deviceTokens: updatedTokens
        }
      })
    }

    return NextResponse.json({ 
      message: "Device token removed successfully",
      deviceToken 
    })
  } catch (error) {
    console.error("Device token removal error:", error)
    return NextResponse.json({ error: "Failed to remove device token" }, { status: 500 })
  }
}
