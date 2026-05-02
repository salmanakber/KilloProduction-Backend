import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const targetLat = Number(body?.targetLat)
    const targetLng = Number(body?.targetLng)
    const radiusKm = Math.max(1, Number(body?.radiusKm || 10))
    const segmentIds = Array.isArray(body?.segmentIds)
      ? body.segmentIds.map((v: unknown) => String(v || "").trim()).filter(Boolean)
      : []

    const hasGeo = Number.isFinite(targetLat) && Number.isFinite(targetLng)
    let candidateUserIds: string[] = []

    if (segmentIds.length > 0) {
      const rows = await prisma.customerSegmentMember.findMany({
        where: {
          segmentId: { in: segmentIds },
          isActive: true,
        },
        select: { userId: true },
      })
      candidateUserIds = Array.from(new Set(rows.map((r) => r.userId)))
    } else {
      const users = await prisma.user.findMany({
        where: { role: "CUSTOMER" },
        select: { id: true },
      })
      candidateUserIds = users.map((u) => u.id)
    }

    if (candidateUserIds.length === 0) {
      return NextResponse.json({ success: true, matchedUsers: 0 })
    }

    if (!hasGeo) {
      return NextResponse.json({ success: true, matchedUsers: candidateUserIds.length })
    }

    const profiles = await prisma.userProfile.findMany({
      where: { userId: { in: candidateUserIds } },
      select: { userId: true, latitude: true, longitude: true },
    })

    const matched = profiles.filter((p) => {
      if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return false
      return haversineKm(targetLat, targetLng, p.latitude as number, p.longitude as number) <= radiusKm
    }).length

    return NextResponse.json({ success: true, matchedUsers: matched })
  } catch (error) {
    console.error("preview-audience:", error)
    return NextResponse.json({ error: "Failed to preview audience" }, { status: 500 })
  }
}
