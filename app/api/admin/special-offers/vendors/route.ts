import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const module = (searchParams.get("module") || "PHARMACY").toUpperCase()
    const city = searchParams.get("city") || undefined
    const search = searchParams.get("search") || undefined
    const minRating = searchParams.get("minRating") != null ? Number(searchParams.get("minRating")) : undefined
    const minOrders = searchParams.get("minOrders") != null ? Number(searchParams.get("minOrders")) : undefined

    // We return vendor userId + display name + basic stats + coordinates
    if (module === "PHARMACY") {
      const where: any = {}
      if (minRating != null && !isNaN(minRating)) where.rating = { gte: minRating }
      if (minOrders != null && !isNaN(minOrders)) where.totalOrders = { gte: minOrders }
      if (search) where.pharmacyName = { contains: search, mode: "insensitive" }
      if (city) where.address = { contains: city, mode: "insensitive" }
      const rows = await prisma.pharmacy.findMany({
        where,
        select: { userId: true, pharmacyName: true, address: true, rating: true, totalOrders: true, lat: true, lon: true },
        take: 500,
        orderBy: { totalOrders: "desc" },
      })
      return NextResponse.json({
        vendors: rows.map(r => ({
          userId: r.userId,
          name: r.pharmacyName,
          address: r.address,
          rating: r.rating ?? 0,
          totalOrders: r.totalOrders ?? 0,
          latitude: r.lat,
          longitude: r.lon,
        })),
      })
    }

    if (module === "GROCERY") {
      const where: any = {}
      if (minRating != null && !isNaN(minRating)) where.rating = { gte: minRating }
      if (minOrders != null && !isNaN(minOrders)) where.totalOrders = { gte: minOrders }
      if (search) where.storeName = { contains: search, mode: "insensitive" }
      if (city) where.address = { contains: city, mode: "insensitive" }
      const rows = await prisma.groceryStore.findMany({
        where,
        select: { userId: true, storeName: true, address: true, rating: true, totalOrders: true, latitude: true, longitude: true },
        take: 500,
        orderBy: { totalOrders: "desc" },
      })
      return NextResponse.json({
        vendors: rows.map(r => ({
          userId: r.userId,
          name: r.storeName,
          address: r.address,
          rating: r.rating ?? 0,
          totalOrders: r.totalOrders ?? 0,
          latitude: r.latitude,
          longitude: r.longitude,
        })),
      })
    }

    if (module === "FOOD") {
      const where: any = {}
      if (minRating != null && !isNaN(minRating)) where.rating = { gte: minRating }
      if (minOrders != null && !isNaN(minOrders)) where.totalOrders = { gte: minOrders }
      if (search) where.name = { contains: search, mode: "insensitive" }
      if (city) where.address = { contains: city, mode: "insensitive" }
      const rows = await prisma.restaurant.findMany({
        where,
        select: { userId: true, name: true, address: true, rating: true, totalOrders: true, latitude: true, longitude: true },
        take: 500,
        orderBy: { totalOrders: "desc" },
      })
      return NextResponse.json({
        vendors: rows.map(r => ({
          userId: r.userId,
          name: r.name,
          address: r.address,
          rating: r.rating ?? 0,
          totalOrders: r.totalOrders ?? 0,
          latitude: r.latitude,
          longitude: r.longitude,
        })),
      })
    }

    if (module === "AUTO_PARTS") {
      const where: any = {}
      if (minRating != null && !isNaN(minRating)) where.rating = { gte: minRating }
      if (minOrders != null && !isNaN(minOrders)) where.totalOrders = { gte: minOrders }
      if (search) where.storeName = { contains: search, mode: "insensitive" }
      if (city) where.address = { contains: city, mode: "insensitive" }
      const rows = await prisma.autoPartsStore.findMany({
        where,
        select: { userId: true, storeName: true, address: true, rating: true, totalOrders: true, latitude: true, longitude: true },
        take: 500,
        orderBy: { totalOrders: "desc" },
      })
      return NextResponse.json({
        vendors: rows.map(r => ({
          userId: r.userId,
          name: r.storeName,
          address: r.address,
          rating: r.rating ?? 0,
          totalOrders: r.totalOrders ?? 0,
          latitude: r.latitude,
          longitude: r.longitude,
        })),
      })
    }

    return NextResponse.json({ vendors: [] })
  } catch (error) {
    console.error("Special offer vendors list error:", error)
    return NextResponse.json({ error: "Failed to fetch vendors" }, { status: 500 })
  }
}

