import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const userLat = parseFloat(searchParams.get('latitude') || '0')
    const userLon = parseFloat(searchParams.get('longitude') || '0')
    const maxDistance = parseFloat(searchParams.get('maxDistance') || '50')
    const search = searchParams.get('search') || ''
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!userLat || !userLon) {
      return NextResponse.json({ error: 'Location required', message: 'Please provide latitude and longitude' }, { status: 400 })
    }

    const stores = await prisma.groceryStore.findMany({
      where: { isVerified: true },
      select: { id: true, latitude: true, longitude: true },
    })

    const nearbyIds = new Set<string>()
    for (const s of stores) {
      if (s.latitude == null || s.longitude == null) continue
      if (calculateDistance(userLat, userLon, s.latitude, s.longitude) > maxDistance) continue
      nearbyIds.add(s.id)
    }

    if (nearbyIds.size === 0) return NextResponse.json({ categories: [] })

    const products = await prisma.groceryProduct.findMany({
      where: {
        storeId: { in: Array.from(nearbyIds) },
        isActive: true,
        stock: { gt: 0 },
        ...(search ? { category: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      select: { category: true, storeId: true },
    })

    const byCategory = new Map<string, { storeIds: Set<string>; itemCount: number }>()
    for (const p of products) {
      const cat = (p.category || 'Other').trim() || 'Other'
      if (!byCategory.has(cat)) byCategory.set(cat, { storeIds: new Set(), itemCount: 0 })
      const rec = byCategory.get(cat)!
      rec.storeIds.add(p.storeId)
      rec.itemCount += 1
    }

    const adminCategories = await prisma.category.findMany({
      where: { module: "GROCERY", isActive: true, parentId: null },
      select: { id: true, name: true, icon: true, image: true },
    })
    const adminCatMap = new Map(adminCategories.map(c => [c.name.toLowerCase(), c]))

    let categories = Array.from(byCategory.entries())
      .map(([name, data]) => {
        const admin = adminCatMap.get(name.toLowerCase())
        return {
          id: admin?.id || name,
          name,
          image: admin?.image || null,
          icon: admin?.icon || null,
          storeCount: data.storeIds.size,
          itemCount: data.itemCount,
        }
      })
      .sort((a, b) => b.itemCount - a.itemCount)

    if (limit > 0) categories = categories.slice(0, limit)

    return NextResponse.json({ categories, total: categories.length })
  } catch (error) {
    console.error('Error fetching grocery categories:', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}
