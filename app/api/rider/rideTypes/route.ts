import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get all active ride types
    const rideTypes = await prisma.rideType.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        basePrice: true,
        pricePerKm: true,
        pricePerMinute: true,
        weightRanges: true,
        capacity: true,
        features: true,
        vehicleType: true,
        isActive: true,
        createdAt: true,
        imageUrl: true,
        mediaType: true,
      },
      orderBy: {
        basePrice: 'asc',
      },
    })

    return NextResponse.json({
      success: true,
      data: rideTypes,
      count: rideTypes.length,
    })
  } catch (error) {
    console.error("Error fetching ride types:", error)
    return NextResponse.json({ 
      error: "Failed to fetch ride types",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is admin or has permission to create ride types
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const data = await request.json()
    const { name, description, icon, basePrice, pricePerKm, pricePerMinute, capacity, features, vehicleTypes, weightRanges, imageUrl, mediaType } = data

    // Validate required fields
    if (!name || !icon || basePrice === undefined || pricePerKm === undefined) {
      return NextResponse.json({ 
        error: "Missing required fields: name, icon, basePrice, pricePerKm" 
      }, { status: 400 })
    }

    // Create new ride type
    const newRideType = await prisma.rideType.create({
      data: {
        name,
        description,
        icon,
        basePrice: parseFloat(basePrice),
        pricePerKm: parseFloat(pricePerKm),
        pricePerMinute: pricePerMinute ? parseFloat(pricePerMinute) : 0,
        capacity,
        features: features || null,
        vehicleType: vehicleTypes || null,
        weightRanges: weightRanges || null,
        isActive: true,
        imageUrl: imageUrl || null,
        mediaType: mediaType || null,
      },
    })

    return NextResponse.json({
      success: true,
      message: "Ride type created successfully",
      data: newRideType,
    }, { status: 201 })
  } catch (error) {
    console.error("Error creating ride type:", error)
    return NextResponse.json({ 
      error: "Failed to create ride type",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}


