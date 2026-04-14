import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(request: NextRequest) {
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

    // Get leave requests
    const requests = await prisma.staffLeaveRequest.findMany({
      include: {
        staff: {
          select: {
            name: true,
            email: true,
            role: true,
          },
        },
        approvedBy: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const formattedRequests = requests.map((request) => ({
      id: request.id,
      staffId: request.staffId,
      staffName: request.staff.name,
      type: request.type,
      startDate: request.startDate,
      endDate: request.endDate,
      reason: request.reason,
      status: request.status,
      appliedAt: request.createdAt,
      approvedBy: request.approvedBy?.name,
      approvedAt: request.approvedAt,
      rejectionReason: request.rejectionReason,
    }))

    return NextResponse.json({ requests: formattedRequests })
  } catch (error) {
    console.error("Error fetching leave requests:", error)
    return NextResponse.json({ error: "Failed to fetch leave requests" }, { status: 500 })
  }
}
