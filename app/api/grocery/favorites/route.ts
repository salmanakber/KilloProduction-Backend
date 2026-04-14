import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const favorites = await prisma.favoriteGroceryStore.findMany({
      where: { userId: user.id },
      include: {
        store: {
          select: {
            id: true,
            storeName: true,
            logo: true,
            coverImage: true,
            rating: true,
            totalReviews: true,
            isOpen: true,
            isVerified: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      favorites: favorites.map((f) => ({
        id: f.id,
        storeId: f.storeId,
        createdAt: f.createdAt,
        store: f.store,
      })),
    })
  } catch (error) {
    console.error('Error fetching grocery favorites:', error)
    return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { storeId } = body
    if (!storeId) return NextResponse.json({ error: 'Store ID is required' }, { status: 400 })

    const existing = await prisma.favoriteGroceryStore.findUnique({
      where: { userId_storeId: { userId: user.id, storeId } },
    })
    if (existing) {
      return NextResponse.json({
        success: true,
        message: 'Already in favorites',
        favorite: existing,
      })
    }

    const favorite = await prisma.favoriteGroceryStore.create({
      data: { userId: user.id, storeId },
      include: {
        store: {
          select: { id: true, storeName: true, logo: true, coverImage: true },
        },
      },
    })

    return NextResponse.json({ success: true, message: 'Added to favorites', favorite })
  } catch (error) {
    console.error('Error adding grocery favorite:', error)
    return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return NextResponse.json({ error: 'Store ID is required' }, { status: 400 })

    await prisma.favoriteGroceryStore.deleteMany({
      where: { userId: user.id, storeId },
    })

    return NextResponse.json({ success: true, message: 'Removed from favorites' })
  } catch (error) {
    console.error('Error removing grocery favorite:', error)
    return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 })
  }
}
