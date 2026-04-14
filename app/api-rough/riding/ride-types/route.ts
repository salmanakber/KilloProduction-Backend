import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const rideTypes = await prisma.rideType.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        basePrice: "asc",
      },
    })

    return NextResponse.json({ rideTypes })
  } catch (error) {
    console.error("Error fetching ride types:", error)
    return NextResponse.json({ error: "Failed to fetch ride types" }, { status: 500 })
  }
}
