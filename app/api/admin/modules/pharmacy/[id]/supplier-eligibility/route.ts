import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { evaluateWholesalerProductEligibility } from "@/lib/pharmacy-product-eligibility"

const productInclude = {
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
} as const

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: params.id },
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

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    const wholesalers = await prisma.wholesaler.findMany({
      where: { isVerified: true },
      take: 15,
      orderBy: { totalOrders: "desc" },
      select: { id: true, companyName: true },
    })

    const suppliers = []

    for (const w of wholesalers) {
      const products = await prisma.wholesalerProduct.findMany({
        where: { wholesalerId: w.id, isActive: true },
        take: 40,
        orderBy: { updatedAt: "desc" },
        include: productInclude,
      })

      let matched = 0
      let restricted = 0
      const examples: { productName: string; restrictionReason: string }[] = []

      for (const p of products) {
        const { matchesPharmacyProfile, restrictionReason } = await evaluateWholesalerProductEligibility(
          pharmacy,
          p,
        )
        if (matchesPharmacyProfile) matched++
        else {
          restricted++
          if (examples.length < 6 && restrictionReason) {
            examples.push({ productName: p.name, restrictionReason })
          }
        }
      }

      suppliers.push({
        wholesalerId: w.id,
        companyName: w.companyName,
        sampled: products.length,
        matched,
        restricted,
        examples,
      })
    }

    const totalSampled = suppliers.reduce((s, x) => s + x.sampled, 0)
    const totalRestricted = suppliers.reduce((s, x) => s + x.restricted, 0)
    const totalMatched = suppliers.reduce((s, x) => s + x.matched, 0)

    return NextResponse.json({
      pharmacyId: pharmacy.id,
      suppliers,
      summary: {
        wholesalerCount: suppliers.length,
        totalSampled,
        totalMatched,
        totalRestricted,
      },
    })
  } catch (e) {
    console.error("Admin pharmacy supplier-eligibility:", e)
    return NextResponse.json({ error: "Failed to evaluate supplier catalog" }, { status: 500 })
  }
}
