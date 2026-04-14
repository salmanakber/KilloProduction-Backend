import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export async function GET(request: NextRequest) {
  try {
    // Public read: home screens show platform special offers without requiring login.

    const { searchParams } = new URL(request.url)
    const module = (searchParams.get("module") || "PHARMACY").toUpperCase()
    const state = searchParams.get("state") || undefined
    const lat = searchParams.get("lat") ? Number(searchParams.get("lat")) : undefined
    const lon = searchParams.get("lon") ? Number(searchParams.get("lon")) : undefined
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 20)))

    const now = new Date()
    const offers = await prisma.specialOffer.findMany({
      where: {
        isActive: true,
        module: module as any,
        validFrom: { lte: now },
        validUntil: { gte: now },
        ...(state ? { OR: [{ locationState: null }, { locationState: state }] } : {}),
      } as any,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    })

    const filtered = offers.filter((o: any) => {
      if (o.locationLatitude == null || o.locationLongitude == null || o.locationRadiusKm == null) return true
      if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return true
      const km = haversineKm(lat, lon, Number(o.locationLatitude), Number(o.locationLongitude))
      return km <= Number(o.locationRadiusKm)
    })

    // Provide a cheap "version" so mobile can compare cache vs server.
    const version = filtered.reduce((max, o: any) => {
      const t = new Date(o.updatedAt || o.createdAt).getTime()
      return t > max ? t : max
    }, 0)

    return NextResponse.json({
      offers: filtered,
      version: version ? new Date(version).toISOString() : null,
    })
  } catch (error) {
    console.error("Customer special offers error:", error)
    return NextResponse.json({ error: "Failed to fetch offers" }, { status: 500 })
  }
}

