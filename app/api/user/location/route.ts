import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const latitude = Number(body?.latitude)
    const longitude = Number(body?.longitude)
    const city = typeof body?.city === "string" ? body.city.trim() : null
    const country = typeof body?.country === "string" ? body.country.trim() : null
    const locationName = typeof body?.locationName === "string" ? body.locationName.trim() : null

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: "latitude and longitude are required" }, { status: 400 })
    }

    await prisma.userProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        latitude,
        longitude,
        city,
        country,
        lastLocationAt: new Date(),
      },
      update: {
        latitude,
        longitude,
        city,
        country,
        lastLocationAt: new Date(),
      },
    })

    await prisma.userActivity.create({
      data: {
        userId: user.id,
        activityType: "SESSION_START",
        latitude,
        longitude,
        locationName: locationName || city || country || undefined,
        metadata: { source: "mobile_location_sync" },
      },
    }).catch(() => null)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("user/location POST:", error)
    return NextResponse.json({ error: "Failed to save user location" }, { status: 500 })
  }
}
