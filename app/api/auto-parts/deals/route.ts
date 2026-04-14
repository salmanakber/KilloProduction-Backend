import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const city = searchParams.get('city') // City filter
    const limit = parseInt(searchParams.get('limit') || '5')

    // Build where clause for products with discounts
    const productWhere: any = {
      type: 'AUTO_PART',
      isActive: true,
      stockQuantity: { gt: 0 },
      comparePrice: { not: null },
    }

    // Filter by vendor city if provided
    if (city) {
      productWhere.vendor = {
        vendorProfile: {
          city: {
            contains: city,
            mode: 'insensitive'
          }
        }
      }
    }

    // Get products with discounts (comparePrice > price)
    const deals = await prisma.product.findMany({
      where: {
        ...productWhere,
        price: { lt: prisma.product.fields.comparePrice }
      },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            vendorProfile: {
              select: {
                businessName: true,
                logo: true,
                city: true,
                state: true,
              }
            }
          }
        },
        reviews: {
          select: {
            rating: true,
          }
        }
      },
      orderBy: [
        // Sort by discount percentage (highest first)
        { createdAt: 'desc' }
      ],
      take: limit,
    })

    const dealsWithDiscount = deals.map(part => {
      const discount = part.comparePrice && part.price
        ? Math.round(((part.comparePrice - part.price) / part.comparePrice) * 100)
        : 0

      const avgRating = part.reviews.length > 0
        ? part.reviews.reduce((sum, r) => sum + r.rating, 0) / part.reviews.length
        : 4.5

      const vendorProfile = part.vendor.vendorProfile

      return {
        id: part.id,
        name: part.name,
        description: part.description,
        partNumber: part.sku,
        brand: part.brand || '',
        model: '',
        year: '',
        partType: '',
        category: part.category?.name || '',
        condition: '',
        price: part.price,
        compareAtPrice: part.comparePrice,
        discount: discount,
        stock: part.stockQuantity,
        images: part.images,
        warranty: '',
        rating: avgRating,
        reviews: part.reviews.length,
        store: {
          id: part.vendor.id,
          name: vendorProfile?.businessName || part.vendor.name || '',
          logo: vendorProfile?.logo || part.vendor.avatar,
          rating: 4.5,
          isVerified: part.vendor.isVerified || false,
        }
      }
    })

    // Sort by discount percentage
    dealsWithDiscount.sort((a, b) => b.discount - a.discount)

    return NextResponse.json({
      deals: dealsWithDiscount,
    })
  } catch (error) {
    console.error("Deals fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 })
  }
}

