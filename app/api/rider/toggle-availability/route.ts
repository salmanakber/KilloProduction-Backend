import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { socketIOServer } from "@/lib/socket-server"

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { isAvailable, isOnline, currentLocation } = await request.json()

    // Resolve rider profile first to avoid Prisma P2025 on update.
    const existingProfile = await prisma.riderProfile.findUnique({
      where: { userId: session.id },
      select: { id: true },
    })
    if (!existingProfile) {
      return NextResponse.json(
        {
          error: "Rider profile not found. Please complete rider verification/profile setup first.",
          code: "RIDER_PROFILE_NOT_FOUND",
        },
        { status: 409 }
      )
    }

    // Update rider profile basic info (safe: row existence verified above).
    await prisma.riderProfile.updateMany({
      where: { userId: session.id },
      data: {
        isAvailable,
        currentLocation: currentLocation || undefined,
        isOnline: new Date(), // still update for reference
      },
    })

    const riderProfile = await prisma.riderProfile.findUniqueOrThrow({
      where: { userId: session.id },
    })

    // Handle online/offline session tracking
    if (isOnline) {
      // Rider goes online → start new session
      await prisma.riderOnlineSession.create({
        data: {
          riderId: riderProfile.id,
          startTime: new Date(),
        },
      })
    } else {
      // Rider goes offline → close the last open session
      const lastSession = await prisma.riderOnlineSession.findFirst({
        where: {
          riderId: riderProfile.id,
          endTime: null,
        },
        orderBy: { startTime: "desc" },
      })

      if (lastSession) {
        await prisma.riderOnlineSession.update({
          where: { id: lastSession.id },
          data: { endTime: new Date() },
        })
      }
    }

    // Emit socket event to notify the rider about status change
    try {
      await socketIOServer.sendNotificationToUser(session.id, {
        type: 'rider_status_change',
        isOnline,
        isAvailable,
        riderId: riderProfile.id,
        timestamp: new Date().toISOString(),
        message: isOnline 
          ? 'You are now online and available for requests'
          : 'You are now offline and unavailable for requests'
      })
    } catch (socketError) {
      console.error('Error sending socket notification:', socketError)
      // Don't fail the request if socket emission fails
    }

    return NextResponse.json({ riderProfile })
  } catch (error) {
    console.error("Error toggling availability:", error)
    return NextResponse.json(
      { error: "Failed to update availability" },
      { status: 500 },
    )
  }
}
