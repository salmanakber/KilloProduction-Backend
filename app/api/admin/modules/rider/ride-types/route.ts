import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    // Fetch all active ride types
    const rideTypes = await prisma.rideType.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        basePrice: true,
        pricePerKm: true,
        capacity: true,
        icon: true,
      },
      orderBy: {
        name: "asc",
      },
    })

    return NextResponse.json({
      success: true,
      rideTypes,
    })
  } catch (error) {
    console.error("Error fetching ride types:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch ride types",
      },
      { status: 500 }
    )
  }
}
