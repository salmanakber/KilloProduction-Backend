import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { evaluateWholesalerProductEligibility } from "@/lib/pharmacy-product-eligibility"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        selectedIllnesses: true,
        specializations: {
          select: {
            medicineOriginId: true,
            illnessTypes: true,
            medicineOrigin: { select: { id: true, displayName: true, name: true } },
          },
        },
      },
    })

    const supplier = await prisma.wholesaler.findUnique({
      where: {
        id: params.id,
        isVerified: true,
        user: { isActive: true },
      },
      include: {
        wholesalerProducts: {
          where: { isActive: true },
          include: {
            wholesalerMedicine: {
              include: {
                centralMedicine: {
                  include: {
                    medicineOrigins: {
                      include: { medicineOrigin: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: { name: "asc" },
          skip: (page - 1) * limit,
          take: limit,
        },
        _count: {
          select: {
            wholesalerProducts: true,
            supplierOrders: true,
          },
        },
      },
    })

    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 })
    }

    const totalProducts = await prisma.wholesalerProduct.count({
      where: {
        wholesalerId: params.id,
        isActive: true,
      },
    })

    const productsWithEligibility = await Promise.all(
      supplier.wholesalerProducts.map(async (p) => {
        if (!pharmacy) {
          return {
            ...p,
            matchesPharmacyProfile: true,
            restrictionReason: null as string | null,
          }
        }
        const { matchesPharmacyProfile, restrictionReason } = await evaluateWholesalerProductEligibility(
          pharmacy,
          p,
        )
        return {
          ...p,
          matchesPharmacyProfile,
          restrictionReason,
        }
      }),
    )

    const matchedOnPage = productsWithEligibility.filter((p) => p.matchesPharmacyProfile).length

    return NextResponse.json({
      supplier: {
        id: supplier.id,
        companyName: supplier.companyName,
        description: supplier.description,
        rating: supplier.rating,
        totalOrders: supplier.totalOrders,
        specialties: supplier.specialties,
        deliveryZones: supplier.deliveryZones,
        paymentTerms: supplier.paymentTerms,
        phone: supplier.phone,
        email: supplier.email,
        website: supplier.website,
        logo: supplier.logo,
        address: supplier.address,
        totalProducts: supplier._count.wholesalerProducts,
        supplierOrdersCount: supplier._count.supplierOrders,
        isVerified: supplier.isVerified,
        createdAt: supplier.createdAt,
      },
      products: productsWithEligibility,
      eligibility: pharmacy
        ? {
            pharmacyId: pharmacy.id,
            specializationOriginCount: pharmacy.specializations.length,
            matchedOnPage,
            restrictedOnPage: productsWithEligibility.length - matchedOnPage,
            notice:
              productsWithEligibility.length > matchedOnPage
                ? "Some items are outside your pharmacy’s medicine origins or illness specializations. They are shown as unavailable to order."
                : null,
          }
        : {
            pharmacyId: null,
            matchedOnPage: productsWithEligibility.length,
            restrictedOnPage: 0,
            notice: "Complete your pharmacy profile to filter supplier catalog by your specializations.",
          },
      pagination: {
        page,
        limit,
        total: totalProducts,
        pages: Math.ceil(totalProducts / limit),
      },
    })
  } catch (error) {
    console.error("Supplier detail fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch supplier details" }, { status: 500 })
  }
}
