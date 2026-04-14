import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        pharmacyName: true,
        address: true,
        lat: true,
        lon: true,
        phone: true,
        email: true,
        logo: true,
        coverImage: true,
        rating: true,
        totalReviews: true,
        description: true,
        is24Hours: true,
        openingHours: true,
        status: true,
      },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      pharmacy: {
        id: pharmacy.id,
        name: pharmacy.pharmacyName,
        storeName: pharmacy.pharmacyName,
        address: pharmacy.address,
        latitude: pharmacy.lat ? Number(pharmacy.lat) : null,
        longitude: pharmacy.lon ? Number(pharmacy.lon) : null,
        phone: pharmacy.phone,
        email: pharmacy.email,
        logo: pharmacy.logo,
        coverImage: pharmacy.coverImage,
        rating: pharmacy.rating,
        totalReviews: pharmacy.totalReviews,
        description: pharmacy.description,
        is24Hours: pharmacy.is24Hours,
        openingHours: pharmacy.openingHours,
        status: pharmacy.status,
      },
    })
  } catch (error: unknown) {
    console.error("Error fetching pharmacy:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch pharmacy" },
      { status: 500 }
    )
  }
}
