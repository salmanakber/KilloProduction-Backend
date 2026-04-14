import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    console.log("Session:", session)

    if (!session || session.role !== "MECHANIC") {
      return NextResponse.json({ error: "Unauthorized - Mechanic access only" }, { status: 401 })
    }

    // Get location data from request body
    const body = await request.json()
    const { lat, lng, accuracy, timestamp } = body

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

    console.log("Updating mechanic location:", {
      userId: session.id,
      coordinates: `${latitude}, ${longitude}`,
      accuracy: accuracy || null
    })

    // Update mechanic profile with location
    await prisma.mechanicProfile.update({
      where: { userId: session.id },
      data: {
        latitude,
        longitude,
      },
    })

    return NextResponse.json({ 
      message: "Location updated successfully",
      latitude,
      longitude
    })
  } catch (error: any) {
    console.error("Error updating mechanic location:", error)
    
    // Handle case where mechanic profile doesn't exist
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Mechanic profile not found" }, { status: 404 })
    }
    
    return NextResponse.json({ 
      error: error.message || "Internal server error" 
    }, { status: 500 })
  }
}

