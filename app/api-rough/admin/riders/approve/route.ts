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

    // Verify admin role
    const admin = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (!admin || !["ADMIN", "SUPER_ADMIN"].includes(admin.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { riderId, approved, notes } = await request.json()

    // Get rider profile
    const rider = await prisma.user.findUnique({
      where: { id: riderId },
      include: {
        riderProfile: true,
        userProfile: true,
      },
    })

    if (!rider || rider.role !== "RIDER") {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 })
    }

    // Update rider approval status
    const updatedRider = await prisma.riderProfile.update({
      where: { userId: riderId },
      data: {
        isApproved: approved,
        isVerified: approved, // Auto-verify when approved
        verificationNotes: notes,
        approvedAt: approved ? new Date() : null,
        approvedBy: approved ? session.user.id : null,
      },
    })

    // Send notification to rider
    await prisma.notification.create({
      data: {
        userId: riderId,
        title: approved ? "Application Approved!" : "Application Rejected",
        message: approved
          ? "Congratulations! Your rider application has been approved. You can now start accepting rides."
          : `Your rider application has been rejected. ${notes || "Please contact support for more information."}`,
        type: "SYSTEM",
        data: {
          approved,
          notes,
        },
      },
    })

    // TODO: Send email notification
    // TODO: Send push notification

    return NextResponse.json({
      message: approved ? "Rider approved successfully" : "Rider rejected",
      rider: {
        ...rider,
        riderProfile: updatedRider,
      },
    })
  } catch (error) {
    console.error("Error updating rider approval:", error)
    return NextResponse.json({ error: "Failed to update rider status" }, { status: 500 })
  }
}
