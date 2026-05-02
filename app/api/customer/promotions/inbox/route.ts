import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * In-app promotions: campaigns in window (SCHEDULED | RUNNING) filtered by:
 * - explicit participation (launch), or
 * - broadcast (no segment links), or
 * - user's active segment memberships intersecting campaign-linked segments.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = new Date()

    const [memberships, rawCampaigns, profile] = await Promise.all([
      prisma.customerSegmentMember.findMany({
        where: { userId: user.id, isActive: true },
        select: { segmentId: true },
      }),
      prisma.marketingCampaign.findMany({
        where: {
          status: { in: ["SCHEDULED", "RUNNING"] },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
          AND: [{ OR: [{ startDate: null }, { startDate: { lte: now } }] }],
        },
        include: {
          CampaignSegments: { select: { A: true } },
          participants: {
            where: { userId: user.id },
            select: { id: true },
            take: 1,
          },
        },
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
        take: 80,
      }),
      prisma.userProfile.findUnique({
        where: { userId: user.id },
        select: { city: true, country: true, latitude: true, longitude: true },
      }),
    ])

    const userSegments = new Set(memberships.map((m) => m.segmentId))

    const campaigns = rawCampaigns.filter((c) => {
      const targeting =
        c.content && typeof c.content === "object"
          ? ((c.content as Record<string, unknown>).targeting as Record<string, unknown> | undefined)
          : undefined
      const targetingCoordinates =
        c.content && typeof c.content === "object"
          ? ((c.content as Record<string, unknown>).targetingCoordinates as Record<string, unknown> | undefined)
          : undefined
      const locationFilters = Array.isArray(targeting?.location)
        ? targeting.location.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean)
        : []
      const targetLat = Number(targetingCoordinates?.lat)
      const targetLng = Number(targetingCoordinates?.lng)
      const targetRadiusKm = Math.max(1, Number(targetingCoordinates?.radiusKm || 10))
      const hasGeoTarget = Number.isFinite(targetLat) && Number.isFinite(targetLng)
      if (hasGeoTarget) {
        if (!Number.isFinite(profile?.latitude) || !Number.isFinite(profile?.longitude)) return false
        const distance = haversineKm(targetLat, targetLng, profile?.latitude as number, profile?.longitude as number)
        if (distance > targetRadiusKm) return false
      } else if (locationFilters.length > 0) {
        const userLoc = `${(profile?.city || "").toLowerCase()} ${(profile?.country || "").toLowerCase()}`.trim()
        if (!locationFilters.some((needle) => userLoc.includes(needle))) return false
      }

      if (c.participants.length > 0) return true
      const linked = c.CampaignSegments ?? []
      if (linked.length === 0) return true
      return linked.some((row) => userSegments.has(row.A))
    })

    const payload = campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      type: c.type,
      status: c.status,
      startDate: c.startDate?.toISOString() ?? null,
      endDate: c.endDate?.toISOString() ?? null,
      timezone: c.timezone,
      schedule: c.schedule,
      content: c.content,
      priority: c.priority,
      matchedBy:
        c.participants.length > 0 ? "participant" : (c.CampaignSegments?.length ?? 0) === 0 ? "broadcast" : "segment",
    }))

    return NextResponse.json({ success: true, campaigns: payload })
  } catch (e) {
    console.error("promotions/inbox:", e)
    return NextResponse.json({ error: "Failed to load promotions" }, { status: 500 })
  }
}
