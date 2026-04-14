import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"


export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const state = searchParams.get("state") || undefined
    const lat = searchParams.get("lat") ? Number(searchParams.get("lat")) : undefined
    const lon = searchParams.get("lon") ? Number(searchParams.get("lon")) : undefined

    const now = new Date()
    const offers = await prisma.specialOffer.findMany({
      where: {
        isActive: true,
        module: "PHARMACY",
        validFrom: { lte: now },
        validUntil: { gte: now },
        ...(state ? { OR: [{ locationState: null }, { locationState: state }] } : {}),
      } as any,
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    // Lightweight location filtering if offer has radius configured
    const filtered = offers.filter((o: any) => {
      if (o.locationLatitude == null || o.locationLongitude == null || o.locationRadiusKm == null) return true
      if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return true
      const R = 6371
      const dLat = ((o.locationLatitude - lat) * Math.PI) / 180
      const dLon = ((o.locationLongitude - lon) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((o.locationLatitude * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      const km = R * c
      return km <= Number(o.locationRadiusKm)
    })

    return NextResponse.json({ offers: filtered })
  } catch (error) {
    console.error("Fetch pharmacy special offers error:", error)
    return NextResponse.json({ error: "Failed to fetch offers" }, { status: 500 })
  }
}
