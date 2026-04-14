import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function formatMech(profile: {
  id: string
  businessName: string
  logo?: string | null
  rating?: number | null
  totalReviews?: number | null
  hourlyRate?: number | null
  isVerified?: boolean | null
  city?: string | null
  latitude?: number | null
  longitude?: number | null
}, user: { id: string; name?: string | null }, distanceKm?: number) {
  return {
    id: user.id,
    mechanicProfileId: profile.id,
    businessName: profile.businessName || user.name,
    logo: profile.logo,
    rating: profile.rating ?? 0,
    totalReviews: profile.totalReviews ?? 0,
    hourlyRate: profile.hourlyRate,
    isVerified: profile.isVerified ?? false,
    city: profile.city,
    distance: distanceKm != null ? `${distanceKm.toFixed(1)} km` : undefined,
    distanceValue: distanceKm,
  }
}

/**
 * Last mechanic the customer interacted with + top-rated nearby mechanics.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const lat = searchParams.get("latitude") ? parseFloat(searchParams.get("latitude")!) : null
    const lng = searchParams.get("longitude") ? parseFloat(searchParams.get("longitude")!) : null
    const city = searchParams.get("city")?.trim() || null
    const maxKm = parseFloat(searchParams.get("maxKm") || "50")

    const lastJob = await prisma.mechanicServiceRequest.findFirst({
      where: { customerId: user.id, mechanicId: { not: null } },
      orderBy: { updatedAt: "desc" },
      include: {
        mechanic: {
          include: { user: true },
        },
      },
    })

    let lastMechanic: ReturnType<typeof formatMech> | null = null
    if (lastJob?.mechanic?.user) {
      const prof = lastJob.mechanic
      const u = prof.user
      let d: number | undefined
      if (lat != null && lng != null && prof.latitude != null && prof.longitude != null) {
        d = calculateDistance(lat, lng, prof.latitude, prof.longitude)
      }
      lastMechanic = formatMech(prof, u, d)
    }

    const mechanics = await prisma.user.findMany({
      where: {
        role: "MECHANIC",
        mechanicProfile: { some: { isActive: true } },
      },
      include: {
        mechanicProfile: true,
      },
      take: 40,
    })

    const scored: Array<{ m: ReturnType<typeof formatMech>; score: number }> = []
    for (const mech of mechanics) {
      const prof = Array.isArray(mech.mechanicProfile) ? mech.mechanicProfile[0] : mech.mechanicProfile
      if (!prof) continue
      let dist = Infinity
      if (lat != null && lng != null && prof.latitude != null && prof.longitude != null) {
        dist = calculateDistance(lat, lng, prof.latitude, prof.longitude)
      } else if (city && prof.city?.toLowerCase() === city.toLowerCase()) {
        dist = 5
      } else if (!lat || !lng) {
        dist = 100
      }
      if (lat != null && lng != null && dist > maxKm) continue

      const ratingScore = (prof.rating || 0) * 20
      const distScore = dist <= 5 ? 40 : dist <= 15 ? 30 : dist <= 30 ? 20 : 10
      const score = ratingScore + distScore + (prof.isVerified ? 10 : 0)
      scored.push({
        m: formatMech(prof, { id: mech.id, name: mech.name }, Number.isFinite(dist) ? dist : undefined),
        score,
      })
    }

    scored.sort((a, b) => b.score - a.score)
    const bestNearby = scored.slice(0, 5).map((s) => s.m)

    return NextResponse.json({ lastMechanic, bestNearby })
  } catch (e: any) {
    console.error("mechanics spotlight:", e)
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}
