import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const { pickupAddress, dropAddress, rideType } = await request.json()

    if (!pickupAddress || !dropAddress || !rideType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Get ride type details
    const rideTypeData = await prisma.rideType.findUnique({
      where: { id: rideType },
    })

    if (!rideTypeData) {
      return NextResponse.json({ error: "Invalid ride type" }, { status: 400 })
    }

    // Calculate distance (mock calculation - in real app, use Google Maps API)
    const estimatedDistance = Math.random() * 20 + 2 // 2-22 km
    const estimatedFare = rideTypeData.basePrice + estimatedDistance * rideTypeData.pricePerKm

    // Add surge pricing if needed (mock)
    const surgePricing = 1.0 // No surge
    const finalFare = estimatedFare * surgePricing

    return NextResponse.json({
      estimatedFare: Math.round(finalFare * 100) / 100,
      estimatedDistance: Math.round(estimatedDistance * 100) / 100,
      surgePricing,
      rideType: rideTypeData,
    })
  } catch (error) {
    console.error("Error calculating fare:", error)
    return NextResponse.json({ error: "Failed to calculate fare" }, { status: 500 })
  }
}
