import { NextRequest, NextResponse } from 'next/server'
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
    const limit = parseInt(searchParams.get('limit') || '10')
    const storeId = searchParams.get('storeId')
    const userLat = searchParams.get('latitude') ? parseFloat(searchParams.get('latitude')!) : null
    const userLon = searchParams.get('longitude') ? parseFloat(searchParams.get('longitude')!) : null
    const maxDistance = searchParams.get('maxDistance') ? parseFloat(searchParams.get('maxDistance')!) : null

    const now = new Date()
    const where: any = {
      isActive: true,
      startsAt: { lte: now },
      expiresAt: { gte: now },
      OR: [
        { approvalStatus: 'APPROVED' },
        { approvalStatus: null },
        { promoKind: 'REGULAR' },
      ],
    }
    if (storeId) where.storeId = storeId

    const offers = await prisma.groceryOffer.findMany({
      where,
      include: {
        store: {
          select: {
            id: true,
            storeName: true,
            logo: true,
            coverImage: true,
            isOpen: true,
            isVerified: true,
            rating: true,
            totalReviews: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      orderBy: [{ discountValue: 'desc' }, { expiresAt: 'asc' }],
    })

    let filtered = offers
    if (userLat != null && userLon != null && maxDistance != null) {
      filtered = offers
        .map((offer) => {
          const s = offer.store
          const lat = s.latitude
          const lon = s.longitude
          if (lat == null || lon == null) return null
          const d = calculateDistance(userLat, userLon, lat, lon)
          if (d > maxDistance) return null
          return { ...offer, store: { ...s, distance: parseFloat(d.toFixed(2)) } }
        })
        .filter((o): o is NonNullable<typeof o> => o !== null)
    }

    filtered = filtered.slice(0, limit)

    return NextResponse.json({
      offers: filtered.map((o) => ({
        id: o.id,
        storeId: o.storeId,
        title: o.title,
        description: o.description,
        discountType: o.discountType,
        discountValue: o.discountValue,
        minOrderAmount: o.minOrderAmount,
        maxDiscount: o.maxDiscount,
        itemName: o.itemName,
        itemPrice: o.itemPrice,
        images: o.images,
        promoKind: (o as any).promoKind ?? 'REGULAR',
        mysteryTeaser: (o as any).mysteryTeaser ?? null,
        isActive: o.isActive,
        startsAt: o.startsAt,
        expiresAt: o.expiresAt,
        store: o.store,
      })),
      total: filtered.length,
    })
  } catch (error) {
    console.error('Error fetching grocery offers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
