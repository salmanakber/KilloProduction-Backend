import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const store = await prisma.groceryStore.findUnique({
      where: { id },
      include: {
        products: {
          where: { isActive: true, stock: { gt: 0 } },
          orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }],
        },
        groceryOffers: {
          where: {
            isActive: true,
            startsAt: { lte: new Date() },
            expiresAt: { gte: new Date() },
          },
          orderBy: { discountValue: 'desc' },
        },
        _count: {
          select: {
            products: { where: { isActive: true, stock: { gt: 0 } } },
            reviews: true,
          },
        },
      },
    })

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    const byCategory = new Map<string, (typeof store.products)[0][]>()
    for (const p of store.products) {
      const cat = (p.category || 'Other').trim() || 'Other'
      if (!byCategory.has(cat)) byCategory.set(cat, [])
      byCategory.get(cat)!.push(p)
    }

    const categories = Array.from(byCategory.entries()).map(([name, items]) => ({
      id: name,
      name,
      items,
      itemCount: items.length,
    }))

    const { products: _p, ...storeRest } = store
    return NextResponse.json({
      store: {
        ...storeRest,
        productsCount: store._count.products,
        reviewsCount: store._count.reviews,
        categories,
      },
    })
  } catch (error) {
    console.error('Error fetching grocery store:', error)
    return NextResponse.json({ error: 'Failed to fetch store' }, { status: 500 })
  }
}
