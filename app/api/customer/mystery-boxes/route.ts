import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const module = (searchParams.get("module") || "").toUpperCase()
    const lat = parseFloat(searchParams.get("latitude") || "0")
    const lon = parseFloat(searchParams.get("longitude") || "0")
    const maxKm = parseFloat(searchParams.get("maxKm") || "25")
    const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") || "10")))

    if (!lat || !lon) {
      return NextResponse.json({ error: "latitude and longitude are required" }, { status: 400 })
    }

    const now = new Date()
    const approvedFilter = { isActive: true, approvalStatus: "APPROVED", promoKind: { in: ["MYSTERY", "FLASH"] }, startsAt: { lte: now }, expiresAt: { gte: now } }

    const boxes: any[] = []

    if (module !== "GROCERY") {
      const foodOffers = await prisma.restaurantOffer.findMany({
        where: approvedFilter,
        include: {
          restaurant: {
            select: { id: true, name: true, logo: true, coverImage: true, latitude: true, longitude: true, isOpen: true, rating: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit * 3,
      })

      

      

      for (const o of foodOffers) {
        const rLat = o.restaurant.latitude
        const rLon = o.restaurant.longitude
        if (rLat == null || rLon == null) continue
        const dist = haversine(lat, lon, rLat, rLon)
        if (dist > maxKm) continue
        boxes.push({
          id: o.id,
          module: "FOOD",
          promoKind: o.promoKind,
          title: o.title,
          description: o.description,
          mysteryTeaser: o.mysteryTeaser,
          discountType: o.discountType,
          discountValue: o.discountValue,
          itemName: o.itemName,
          itemPrice: o.itemPrice,
          bundleItems: o.bundleItems,
          images: o.images,
          expiresAt: o.expiresAt,
          vendorId: o.restaurant.id,
          vendorName: o.restaurant.name,
          vendorLogo: o.restaurant.logo,
          vendorImage: o.restaurant.coverImage,
          vendorOpen: o.restaurant.isOpen,
          vendorRating: o.restaurant.rating,
          distance: parseFloat(dist.toFixed(2)),
        })
      }
    }

    if (module !== "FOOD") {
      const groceryOffers = await prisma.groceryOffer.findMany({
        where: approvedFilter,
        include: {
          store: {
            select: { id: true, storeName: true, logo: true, coverImage: true, latitude: true, longitude: true, isOpen: true, rating: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit * 3,
      })
      console.log("groceryOffers", groceryOffers)

      for (const o of groceryOffers) {
        const sLat = o.store.latitude
        const sLon = o.store.longitude
        if (sLat == null || sLon == null) continue
        const dist = haversine(lat, lon, sLat, sLon)
        if (dist > maxKm) continue
        boxes.push({
          id: o.id,
          module: "GROCERY",
          promoKind: o.promoKind,
          title: o.title,
          description: o.description,
          mysteryTeaser: o.mysteryTeaser,
          discountType: o.discountType,
          discountValue: o.discountValue,
          itemName: o.itemName,
          itemPrice: o.itemPrice,
          bundleItems: o.bundleItems,
          images: o.images,
          expiresAt: o.expiresAt,
          vendorId: o.store.id,
          vendorName: o.store.storeName,
          vendorLogo: o.store.logo,
          vendorImage: o.store.coverImage,
          vendorOpen: o.store.isOpen,
          vendorRating: o.store.rating,
          distance: parseFloat(dist.toFixed(2)),
        })
      }
    }

    boxes.sort((a, b) => a.distance - b.distance)

    return NextResponse.json({ boxes: boxes.slice(0, limit) })
  } catch (e) {
    console.error("mystery-boxes GET:", e)
    return NextResponse.json({ error: "Failed to load mystery boxes" }, { status: 500 })
  }
}
