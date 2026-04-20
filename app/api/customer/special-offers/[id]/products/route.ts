import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const offer = await prisma.specialOffer.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        title: true,
        subtitle: true,
        description: true,
        discountType: true,
        discountValue: true,
        discountFundedBy: true,
        validFrom: true,
        validUntil: true,
        bannerImageUrl: true,
        imageUrl: true,
        isActive: true,
        module: true,
        maxUses: true,
        usedCount: true,
      },
    })
    if (!offer || !offer.isActive) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    }

    const module = offer.module as "PHARMACY" | "GROCERY" | "FOOD" | "AUTO_PARTS"

    const submissions = await prisma.specialOfferSubmission.findMany({
      where: {
        offerId: params.id,
        status: { in: ["APPROVED", "ACTIVE", "SUBMITTED_PRODUCT"] as any },
      },
      orderBy: { createdAt: "asc" },
    })
    

    if (!submissions.length) {
      return NextResponse.json({
        success: true,
        offer,
        products: [],
      })
    }

    const productIds = submissions.map((s) => s.productId)

    let products: any[] = []
    
    if (module === "PHARMACY") {
      // Submissions store centralMedicineId; the same central ID may appear from multiple vendors.
      // One row per submission: resolve that vendor's PharmacyMedicine (not "cheapest globally").
      const uniqueCentralIds = [...new Set(productIds)]
      const centrals = await prisma.centralMedicine.findMany({
        where: { id: { in: uniqueCentralIds } },
      })
      const centralById = new Map(centrals.map((c) => [c.id, c]))

      const vendorUserIds = [...new Set(submissions.map((s) => s.vendorId))]
      const pharmacies = await prisma.pharmacy.findMany({
        where: { userId: { in: vendorUserIds } },
        select: { id: true, userId: true },
      })
      const pharmacyIdByUserId = new Map(pharmacies.map((p) => [p.userId, p.id]))

      type Pair = { pharmacyId: string; centralMedicineId: string }
      const pairs: Pair[] = []
      for (const sub of submissions) {
        const pharmacyId = pharmacyIdByUserId.get(sub.vendorId)
        if (!pharmacyId) continue
        pairs.push({ pharmacyId, centralMedicineId: sub.productId })
      }

      const pmKey = (p: Pair) => `${p.pharmacyId}::${p.centralMedicineId}`

      const pmRows =
        pairs.length > 0
          ? await prisma.pharmacyMedicine.findMany({
              where: {
                OR: pairs.map((p) => ({
                  pharmacyId: p.pharmacyId,
                  centralMedicineId: p.centralMedicineId,
                })),
                stock: { gt: 0 },
                isAvailable: true,
              },
              include: {
                pharmacy: { select: { pharmacyName: true } },
              },
            })
          : []

      const pmByKey = new Map<string, (typeof pmRows)[0]>()
      for (const pm of pmRows) {
        const k = pmKey({
          pharmacyId: pm.pharmacyId,
          centralMedicineId: pm.centralMedicineId,
        })
        if (!pmByKey.has(k)) pmByKey.set(k, pm)
      }

      products = []
      for (const sub of submissions) {
        const pharmacyId = pharmacyIdByUserId.get(sub.vendorId)
        if (!pharmacyId) continue
        const central = centralById.get(sub.productId)
        if (!central) continue
        const pm = pmByKey.get(pmKey({ pharmacyId, centralMedicineId: sub.productId }))
        if (!pm) continue

        products.push({
          id: pm.id,
          submissionId: sub.id,
          centralMedicineId: central.id,
          name: central.name,
          image:
            Array.isArray(central.images) && central.images.length
              ? central.images[0]
              : null,
          price: Number(pm.price) || 0,
          vendorId: pm.pharmacyId,
          vendorName: pm.pharmacy?.pharmacyName || null,
          stock: pm.stock || 0,
          raw: { ...central, pharmacyMedicine: pm },
        })
      }
    } else if (module === "FOOD") {
      const rows = await prisma.menuItem.findMany({
        where: { id: { in: productIds }, isAvailable: true },
        include: { restaurant: true },
      })
      products = rows.map((row) => ({
        id: row.id,
        name: row.name,
        image: Array.isArray(row.images) && row.images.length ? row.images[0] : null,
        price: Number(row.price || 0),
        vendorId: row.restaurantId,
        vendorName: row.restaurant?.name,
        raw: row,
      }))
    } else if (module === "GROCERY") {
      const rows = await prisma.groceryProduct.findMany({
        where: { id: { in: productIds }, isActive: true },
        include: { store: true },
      })
      products = rows.map((row) => ({
        id: row.id,
        name: row.name,
        image: Array.isArray(row.images) && row.images.length ? row.images[0] : null,
        price: Number(row.price || 0),
        vendorId: row.storeId,
        vendorName: row.store?.storeName,
        raw: row,
      }))
    } else if (module === "AUTO_PARTS") {
      const rows = await prisma.product.findMany({
        where: { id: { in: productIds }, type: "AUTO_PART", isActive: true },
        include: { vendor: true },
      })
      products = rows.map((row) => ({
        id: row.id,
        name: row.name,
        image: Array.isArray(row.images) && row.images.length ? row.images[0] : null,
        price: Number(row.price || 0),
        vendorId: row.vendorId,
        vendorName: row.vendor?.name,
        raw: row,
      }))
    }

    const isPercent = String(offer.discountType || "PERCENTAGE").toUpperCase().includes("PERCENT")
    const discountValue = Number(offer.discountValue || 0)

    const enrichedProducts = products.map((p) => {
      const base = Number(p.price || 0)
      let discounted = base
      if (isPercent) {
        const pct = Math.max(0, Math.min(100, discountValue))
        discounted = Math.max(0, base * (1 - pct / 100))
      } else if (discountValue > 0) {
        discounted = Math.max(0, base - discountValue)
      }
      return {
        ...p,
        originalPrice: base,
        discountedPrice: discounted,
      }
    })

    return NextResponse.json({
      success: true,
      offer: {
        id: offer.id,
        title: offer.title,
        subtitle: offer.subtitle,
        description: offer.description,
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        discountFundedBy: offer.discountFundedBy,
        validFrom: offer.validFrom,
        validUntil: offer.validUntil,
        bannerImageUrl: offer.bannerImageUrl,
        imageUrl: offer.imageUrl,
        module,
        maxUses: offer.maxUses ?? null,
        usedCount: offer.usedCount ?? 0,
      },
      products: enrichedProducts,
    })
  } catch (err) {
    console.error("customer special-offers products error", err)
    return NextResponse.json(
      { error: "Failed to load offer products" },
      { status: 500 },
    )
  }
}

