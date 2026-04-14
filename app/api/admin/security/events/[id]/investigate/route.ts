import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const eventId = params.id

    // In a real implementation, you would:
    // 1. Update the security event status in the database
    // 2. Assign the event to an investigator
    // 3. Create audit log entry
    // 4. Set up monitoring for related activities

    const updatedEvent = {
      id: eventId,
      status: "INVESTIGATING",
      assignedTo: user.name || "Admin User",
      investigationStarted: new Date().toISOString(),
    }

    return NextResponse.json({
      success: true,
      message: "Security event marked for investigation",
      event: updatedEvent,
    })
  } catch (error) {
    console.error("Error investigating security event:", error)
    return NextResponse.json({ error: "Failed to investigate security event" }, { status: 500 })
  }
}
