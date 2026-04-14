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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { category } = await params
    const decodedCategory = decodeURIComponent(category)

    const { searchParams } = new URL(request.url)
    const userLat = parseFloat(searchParams.get('latitude') || '0')
    const userLon = parseFloat(searchParams.get('longitude') || '0')
    const maxDistance = parseFloat(searchParams.get('maxDistance') || '50')
    const search = searchParams.get('search') || ''
    const minPrice = parseFloat(searchParams.get('minPrice') || '0')
    const maxPrice = parseFloat(searchParams.get('maxPrice') || '999999')
    const sortBy = searchParams.get('sortBy') || 'distance'
    const sortOrder = searchParams.get('sortOrder') || 'asc'
    const limit = parseInt(searchParams.get('limit') || '50')
    const page = parseInt(searchParams.get('page') || '1')

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

    if (nearbyIds.size === 0) {
      return NextResponse.json({
        category: { id: decodedCategory, name: decodedCategory },
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        filters: { search, minPrice, maxPrice, sortBy, sortOrder },
      })
    }

    const where: {
      storeId: { in: string[] }
      isActive: boolean
      stock: { gt: number }
      category: { contains: string; mode: 'insensitive' }
      price: { gte: number; lte: number }
      OR?: Array<{ name?: { contains: string; mode: 'insensitive' }; description?: { contains: string; mode: 'insensitive' } }>
    } = {
      storeId: { in: Array.from(nearbyIds) },
      isActive: true,
      stock: { gt: 0 },
      category: { contains: decodedCategory, mode: 'insensitive' },
      price: { gte: minPrice, lte: maxPrice },
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }

    const products = await prisma.groceryProduct.findMany({
      where,
      include: {
        store: {
          select: {
            id: true,
            storeName: true,
            logo: true,
            latitude: true,
            longitude: true,
            rating: true,
            totalReviews: true,
            deliveryFee: true,
          },
        },
      },
    })

    const itemsWithDistance = products
      .map((p) => {
        const s = p.store
        const lat = s.latitude
        const lon = s.longitude
        if (lat == null || lon == null) return null
        const d = calculateDistance(userLat, userLon, lat, lon)
        return { ...p, store: { ...s, distance: parseFloat(d.toFixed(2)) } }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    itemsWithDistance.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'distance') cmp = a.store.distance - b.store.distance
      else if (sortBy === 'price') cmp = a.price - b.price
      else if (sortBy === 'rating') cmp = (b.store.rating || 0) - (a.store.rating || 0)
      else if (sortBy === 'name') cmp = a.name.localeCompare(b.name)
      else cmp = a.store.distance - b.store.distance
      return sortOrder === 'asc' ? cmp : -cmp
    })

    const total = itemsWithDistance.length
    const start = (page - 1) * limit
    const paginated = limit > 0 ? itemsWithDistance.slice(start, start + limit) : itemsWithDistance

    return NextResponse.json({
      category: { id: decodedCategory, name: decodedCategory },
      items: paginated,
      total,
      page,
      limit: limit > 0 ? limit : total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 1,
      filters: { search, minPrice, maxPrice, sortBy, sortOrder },
    })
  } catch (error) {
    console.error('Error fetching grocery category items:', error)
    return NextResponse.json({ error: 'Failed to fetch category items' }, { status: 500 })
  }
}
