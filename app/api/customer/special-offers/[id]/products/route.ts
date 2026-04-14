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
      const rows = await prisma.centralMedicine.findMany({
        where: { id: { in: productIds } },
        include: {
          pharmacyMedicines: {
            where: { stock: { gt: 0 } }, // only available stock
            select: {
              id: true,
              pharmacyId: true,
              price: true,
              stock: true,
              pharmacy: {
                select: { pharmacyName: true },
              },
            },
          },
        },
      })
    
      products = rows.map((row) => {
        // sort pharmacies by lowest price
        const sorted = row.pharmacyMedicines.sort(
          (a, b) => Number(a.price) - Number(b.price)
        )
    
        const best = sorted[0] // cheapest pharmacy
    
        return {
          id: row.id,
          name: row.name,
          image:
            Array.isArray(row.images) && row.images.length
              ? row.images[0]
              : null,
    
          // ✅ SAFE access with fallback
          price: best ? Number(best.price) : 0,
          vendorId: best?.pharmacyId || null,
          vendorName: best?.pharmacy?.pharmacyName || null,
          stock: best?.stock || 0,
    
          // optional: keep full data if needed
          raw: row,
        }
      })
    

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

