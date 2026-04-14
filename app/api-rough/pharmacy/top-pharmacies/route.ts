import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const latitude = searchParams.get("lat") ? Number.parseFloat(searchParams.get("lat")!) : null
    const longitude = searchParams.get("lng") ? Number.parseFloat(searchParams.get("lng")!) : null
    const limit = Number.parseInt(searchParams.get("limit") || "10")

    const pharmacies = await prisma.pharmacy.findMany({
      where: {
        isActive: true,
        isVerified: true,
        isApprovedByAdmin: true,
      },
      include: {
        user: {
          select: { name: true, avatar: true },
        },
        specializations: {
          select: {
            origin: true,
            illnessTypes: true,
          },
        },
        _count: {
          select: {
            consultations: {
              where: { status: "COMPLETED" },
            },
            pharmacyMedicines: {
              where: { isAvailable: true },
            },
          },
        },
      },
      orderBy: [{ rating: "desc" }, { totalOrders: "desc" }, { totalReviews: "desc" }, { responseTime: "asc" }],
      take: limit,
    })

    const enrichedPharmacies = pharmacies.map((pharmacy) => ({
      id: pharmacy.id,
      pharmacyName: pharmacy.pharmacyName,
      rating: pharmacy.rating,
      totalReviews: pharmacy.totalReviews,
      totalOrders: pharmacy.totalOrders,
      responseTime: pharmacy.responseTime,
      deliveryAvailable: pharmacy.deliveryAvailable,
      is24Hours: pharmacy.is24Hours,
      logo: pharmacy.logo,
      address: pharmacy.address,
      phone: pharmacy.phone,
      specializations: pharmacy.specializations,
      availableMedicines: pharmacy._count.pharmacyMedicines,
      completedConsultations: pharmacy._count.consultations,
      // Calculate distance if user location provided
      distance:
        latitude && longitude
          ? calculateDistance(
              latitude,
              longitude,
              0,
              0, // Would need pharmacy coordinates
            )
          : null,
    }))

    return NextResponse.json({ pharmacies: enrichedPharmacies })
  } catch (error) {
    console.error("Top pharmacies fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch top pharmacies" }, { status: 500 })
  }
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Radius of the Earth in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
