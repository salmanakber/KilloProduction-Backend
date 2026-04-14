import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function norm(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const offer = await prisma.specialOffer.findUnique({ where: { id: params.id } })
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 })

    const body = await request.json()
    const productId: string = body?.productId
    const data: any = body?.data
    if (!productId) return NextResponse.json({ error: "productId is required" }, { status: 400 })

    // Must be invited+accepted OR purchased slot
    const vendorRow = await prisma.specialOfferVendor.findUnique({
      where: { offerId_vendorId: { offerId: offer.id, vendorId: user.id } },
    })

    const allowed =
      vendorRow?.status === "ACCEPTED" ||
      vendorRow?.status === "PURCHASED_SLOT" ||
      vendorRow?.status === "SUBMITTED_PRODUCT" ||
      vendorRow?.status === "APPROVED"

    if (!allowed) {
      return NextResponse.json({ error: "You are not eligible to submit to this offer" }, { status: 403 })
    }

    // Enforce maxVendors (count distinct vendors who have submitted)
    if (offer.maxVendors != null) {
      const currentVendors = await prisma.specialOfferSubmission.findMany({
        where: { offerId: offer.id },
        distinct: ["vendorId"],
        select: { vendorId: true },
      })
      if (currentVendors.length >= offer.maxVendors) {
        return NextResponse.json({ error: "Offer is full" }, { status: 400 })
      }
    }

    // Module-specific product validation
    if (offer.module === "PHARMACY") {
      const pharmacy = await prisma.pharmacy.findUnique({
        where: { userId: user.id },
        select: { id: true, lat: true, lon: true },
      })
      if (!pharmacy?.id) return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })

      // If offer is tied to a specific pharmacy, enforce it
      if ((offer as any).pharmacyId && (offer as any).pharmacyId !== pharmacy.id) {
        return NextResponse.json({ error: "This offer is not available for your pharmacy" }, { status: 403 })
      }

      // Enforce location criteria if offer has center+radius
      if (offer.locationLatitude != null && offer.locationLongitude != null && offer.locationRadiusKm != null) {
        if (pharmacy.lat == null || pharmacy.lon == null) {
          return NextResponse.json({ error: "Your pharmacy location is not set" }, { status: 400 })
        }
        const km = haversineKm(
          Number(pharmacy.lat),
          Number(pharmacy.lon),
          Number(offer.locationLatitude),
          Number(offer.locationLongitude),
        )
        if (km > Number(offer.locationRadiusKm)) {
          return NextResponse.json({ error: "Your pharmacy is outside this offer area" }, { status: 403 })
        }
      }

      // Find the vendor's inventory row by either PharmacyMedicine.id OR centralMedicineId
      const inv =
        (await prisma.pharmacyMedicine.findFirst({
          where: { id: productId, pharmacyId: pharmacy.id },
          include: { centralMedicine: { select: { name: true, category: true, illnessTypes: true } } },
        })) ||
        (await prisma.pharmacyMedicine.findFirst({
          where: { pharmacyId: pharmacy.id, centralMedicineId: productId },
          include: { centralMedicine: { select: { name: true, category: true, illnessTypes: true } } },
        }))

      if (!inv) return NextResponse.json({ error: "Medicine not found in your inventory" }, { status: 404 })
      if (!inv.isAvailable) return NextResponse.json({ error: "Medicine is not available" }, { status: 400 })
      if (inv.stock <= 0) return NextResponse.json({ error: "Medicine is out of stock" }, { status: 400 })

      // Pharmacy offer conditions:
      // - conditions.medicineCategories: string[] (matches CentralMedicine.category)
      // - conditions.illnessTypes: string[] (matches CentralMedicine.illnessTypes JSON array)
      const medicineCategories = Array.isArray((offer as any)?.conditions?.medicineCategories)
        ? ((offer as any).conditions.medicineCategories as string[])
        : []
      if (medicineCategories.length > 0) {
        const allowed = new Set(medicineCategories.map(norm).filter(Boolean))
        const cat = norm((inv as any).centralMedicine?.category || "")
        if (!cat || !allowed.has(cat)) {
          return NextResponse.json({ error: "This medicine does not match the offer categories" }, { status: 400 })
        }
      }

      const illnessTypes = Array.isArray((offer as any)?.conditions?.illnessTypes)
        ? ((offer as any).conditions.illnessTypes as string[])
        : []
      if (illnessTypes.length > 0) {
        const required = new Set(illnessTypes.map(norm).filter(Boolean))
        const medIll = Array.isArray((inv as any).centralMedicine?.illnessTypes)
          ? ((inv as any).centralMedicine.illnessTypes as any[])
          : []
        let ok = false
        for (const t of medIll) {
          const n = norm(String(t))
          if (n && required.has(n)) {
            ok = true
            break
          }
        }
        if (!ok) {
          return NextResponse.json({ error: "This medicine does not match the offer illness types" }, { status: 400 })
        }
      }

      // Backward compatibility: older offers used illnessCategoryIds (IllnessCategory.medicines is an array of medicine names)
      const illnessIds = Array.isArray((offer as any)?.conditions?.illnessCategoryIds)
        ? ((offer as any).conditions.illnessCategoryIds as string[])
        : []
      if (illnessIds.length > 0) {
        const rows = await prisma.illnessCategory.findMany({
          where: { id: { in: illnessIds }, isActive: true },
          select: { medicines: true },
        })
        const allowed = new Set<string>()
        for (const r of rows) {
          const meds = Array.isArray(r.medicines) ? r.medicines : []
          for (const m of meds) allowed.add(norm(m))
        }
        const medName = norm(inv.centralMedicine?.name || "")
        if (!medName || !allowed.has(medName)) {
          return NextResponse.json({ error: "This medicine does not match the offer illness categories" }, { status: 400 })
        }
      }

      // Store a clean PHARMACY productId consistently as centralMedicineId (so downstream can match)
      ;(body as any).__resolvedProductId = inv.centralMedicineId
    }

    const submission = await prisma.specialOfferSubmission.create({
      data: {
        offerId: offer.id,
        vendorId: user.id,
        module: offer.module as any,
        productId: String((body as any).__resolvedProductId || productId),
        data: data || null,
        status: "SUBMITTED_PRODUCT",
      },
    })

    // Mark vendor row
    if (vendorRow) {
      await prisma.specialOfferVendor.update({
        where: { id: vendorRow.id },
        data: { status: "SUBMITTED_PRODUCT" },
      })
    }

    return NextResponse.json({ success: true, submission })
  } catch (error) {
    console.error("Offer submit error:", error)
    return NextResponse.json({ error: "Failed to submit product" }, { status: 500 })
  }
}

