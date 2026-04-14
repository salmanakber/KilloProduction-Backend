import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Number.parseInt(searchParams.get("limit") || "10")
    const origin = searchParams.get("origin")
    const illness = searchParams.get("illness")
    const location = searchParams.get("location") // User location for distance calculation

    const where: any = {
      isActive: true,
      isApprovedByAdmin: true,
      isVerified: true,
    }

    // Filter by medicine origin if specified
    if (origin) {
      where.medicineOrigins = { has: origin }
    }

    // Filter by illness specialization if specified
    if (illness) {
      where.selectedIllnesses = { has: illness.toLowerCase() }
    }

    const pharmacies = await prisma.pharmacy.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            isActive: true,
          },
        },
        specializations: {
          select: {
            origin: true,
            illnessTypes: true,
          },
        },
        _count: {
          select: {
            pharmacyMedicines: {
              where: {
                isAvailable: true,
                stock: { gt: 0 },
              },
            },
            consultations: {
              where: {
                status: "COMPLETED",
              },
            },
          },
        },
      },
      orderBy: [{ rating: "desc" }, { totalOrders: "desc" }, { responseTime: "asc" }],
      take: limit,
    })

    // Transform data for response
    const topPharmacies = pharmacies.map((pharmacy) => ({
      id: pharmacy.id,
      pharmacyName: pharmacy.pharmacyName,
      rating: pharmacy.rating,
      totalReviews: pharmacy.totalReviews,
      totalOrders: pharmacy.totalOrders,
      responseTime: pharmacy.responseTime,
      address: pharmacy.address,
      phone: pharmacy.phone,
      email: pharmacy.email,
      logo: pharmacy.logo,
      isVerified: pharmacy.isVerified,
      is24Hours: pharmacy.is24Hours,
      deliveryAvailable: pharmacy.deliveryAvailable,
      medicineOrigins: pharmacy.medicineOrigins,
      selectedIllnesses: pharmacy.selectedIllnesses,
      specializations: pharmacy.specializations.map((spec) => ({
        origin: spec.origin,
        illnessTypes: spec.illnessTypes,
      })),
      availableMedicines: pharmacy._count.pharmacyMedicines,
      completedConsultations: pharmacy._count.consultations,
      deliveryZones: pharmacy.deliveryZones,
    }))

    return NextResponse.json({
      pharmacies: topPharmacies,
      total: topPharmacies.length,
    })
  } catch (error) {
    console.error("Top pharmacies fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch top pharmacies" }, { status: 500 })
  }
}
