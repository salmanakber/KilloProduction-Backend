import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)

    if (!session || session.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized - Rider access only" }, { status: 401 })
    }

    // Get location data from request body instead of search params
    const body = await request.json()
    const { lat, lng, heading, speed, accuracy, timestamp } = body

    // Validate required coordinates
    if (!lat || !lng) {
      return NextResponse.json({ error: "Latitude and longitude are required" }, { status: 400 })
    }

    const latitude = parseFloat(lat)
    const longitude = parseFloat(lng)

    // Validate coordinate ranges
    if (latitude < -90 || latitude > 90) {
      return NextResponse.json({ error: "Invalid latitude value" }, { status: 400 })
    }
    if (longitude < -180 || longitude > 180) {
      return NextResponse.json({ error: "Invalid longitude value" }, { status: 400 })
    }

    const locationData = {
      latitude,
      longitude,
      heading: heading ? parseFloat(heading) : null,
      speed: speed ? parseFloat(speed) : null,
      accuracy: accuracy ? parseFloat(accuracy) : null,
      timestamp: timestamp || new Date().toISOString(),
    }

    console.log("Updating rider location:", {
      userId: session.id,
      coordinates: `${latitude}, ${longitude}`,
      heading: locationData.heading,
      speed: locationData.speed,
      accuracy: locationData.accuracy
    })

    // Update rider profile with location and timestamp
    await prisma.riderProfile.update({
      where: { userId: session.id },
      data: {
        currentLocation: locationData,
        lastLocationUpdate: new Date(),
      },
    })

    return NextResponse.json({ 
      message: "Location updated successfully",
      location: locationData
    })

  } catch (error) {
    console.error("Error updating rider location:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}