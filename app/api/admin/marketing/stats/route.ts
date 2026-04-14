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

    // Mock marketing stats - replace with actual database queries
    const stats = {
      totalCampaigns: 25,
      activeCampaigns: 3,
      totalSent: 125430,
      averageOpenRate: 34.2,
      averageClickRate: 8.7,
      conversionRate: 2.3,
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error("Error fetching marketing stats:", error)
    return NextResponse.json({ error: "Failed to fetch marketing stats" }, { status: 500 })
  }
}
