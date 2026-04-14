import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { isAvailable, currentLocation } = await request.json()

    const riderProfile = await prisma.riderProfile.update({
      where: { userId: session.user.id },
      data: {
        isAvailable,
        currentLocation: currentLocation || undefined,
        lastActiveAt: new Date(),
      },
    })

    return NextResponse.json({ riderProfile })
  } catch (error) {
    console.error("Error toggling availability:", error)
    return NextResponse.json({ error: "Failed to update availability" }, { status: 500 })
  }
}
