import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { RideTypeCategory } from "@prisma/client"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') as RideTypeCategory | null

    // Build where clause
    const whereClause: any = {
      isActive: true,
    }

    // Add category filter if provided
    if (category && Object.values(RideTypeCategory).includes(category)) {
      whereClause.category = category
    }

    const rideTypes = await prisma.rideType.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        basePrice: true,
        pricePerKm: true,
        pricePerMinute: true,
        capacity: true,
        features: true,
        vehicleType: true,
        category: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: [
        { category: 'asc' },
        { basePrice: 'asc' }
      ],
    })

    // Group ride types by category for easier consumption
    const groupedRideTypes = rideTypes.reduce((acc, rideType) => {
      const categoryKey = rideType.category
      if (!acc[categoryKey]) {
        acc[categoryKey] = []
      }
      acc[categoryKey].push(rideType)
      return acc
    }, {} as Record<string, typeof rideTypes>)

    return NextResponse.json({ 
      success: true,
      rideTypes: category ? rideTypes : groupedRideTypes,
      count: rideTypes.length,
    })
  } catch (error) {
    console.error("Error fetching ride types:", error)
    return NextResponse.json({ 
      success: false,
      error: "Failed to fetch ride types" 
    }, { status: 500 })
  }
}