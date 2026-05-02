import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const [totalCampaigns, activeCampaigns, totals] = await Promise.all([
      prisma.notificationCampaign.count(),
      prisma.notificationCampaign.count({
        where: { status: { in: ["DRAFT", "SCHEDULED"] } },
      }),
      prisma.notificationCampaign.aggregate({
        _sum: {
          sentCount: true,
          deliveredCount: true,
          openedCount: true,
          clickedCount: true,
        },
      }),
    ])

    const totalSent = totals._sum.sentCount ?? 0
    const delivered = totals._sum.deliveredCount ?? 0
    const opened = totals._sum.openedCount ?? 0
    const clicked = totals._sum.clickedCount ?? 0

    const deliveryRate = totalSent > 0 ? (delivered / totalSent) * 100 : 0
    const openRate = delivered > 0 ? (opened / delivered) * 100 : 0
    const clickRate = opened > 0 ? (clicked / opened) * 100 : 0

    return NextResponse.json({
      totalCampaigns,
      activeCampaigns,
      totalSent,
      deliveryRate,
      openRate,
      clickRate,
    })
  } catch (e) {
    console.error("notification stats:", e)
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 })
  }
}
