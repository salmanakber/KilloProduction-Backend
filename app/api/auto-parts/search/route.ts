import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const city = searchParams.get('city')
    const categoryId = searchParams.get('categoryId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit
    const sortBy = searchParams.get('sortBy') || 'relevance'
    const inStock = searchParams.get('inStock') === 'true'

    if (!query.trim()) {
      return NextResponse.json({ error: "Search query is required" }, { status: 400 })
    }

    // Build where clause
    const productWhere: any = {
      type: 'AUTO_PART',
      isActive: true,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { brand: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
      ]
    }

    if (inStock) {
      productWhere.stockQuantity = { gt: 0 }
    }

    if (categoryId) {
      productWhere.categoryId = categoryId
    }

    // Filter by city if provided
    if (city) {
      productWhere.vendor = {
        vendorProfile: {
          is: {
            city: {
              contains: city,
              mode: 'insensitive'
            }
          }
        }
      }
    }

    // Build orderBy
    const orderBy: any = {}
    if (sortBy === 'price_asc') {
      orderBy.price = 'asc'
    } else if (sortBy === 'price_desc') {
      orderBy.price = 'desc'
    } else if (sortBy === 'name') {
      orderBy.name = 'asc'
    } else {
      // Relevance: prioritize name matches, then description
      orderBy.createdAt = 'desc'
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: productWhere,
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
                }
              }
            }
          },
          category: {
            select: {
              name: true,
            }
          },
          reviews: {
            select: {
              rating: true,
            }
          }
        },
        skip,
        take: limit,
        orderBy
      }),
      prisma.product.count({ where: productWhere })
    ])

    // Sort by relevance if sortBy is 'relevance'
    let sortedProducts = products
    if (sortBy === 'relevance') {
      sortedProducts = products.sort((a, b) => {
        const aNameMatch = a.name.toLowerCase().includes(query.toLowerCase())
        const bNameMatch = b.name.toLowerCase().includes(query.toLowerCase())
        if (aNameMatch && !bNameMatch) return -1
        if (!aNameMatch && bNameMatch) return 1
        return 0
      })
    }

    const formattedProducts = sortedProducts.map(product => {
      const avgRating = product.reviews.length > 0
        ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length
        : 4.5

      const vendorProfile = product.vendor.vendorProfile

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        compareAtPrice: product.comparePrice,
        images: product.images,
        stock: product.stockQuantity,
        rating: avgRating,
        reviews: product.reviews.length,
        category: product.category?.name || '',
        brand: product.brand || '',
        sku: product.sku || '',
        store: {
          id: product.vendor.id,
          name: vendorProfile?.businessName || product.vendor.name || '',
          logo: vendorProfile?.logo,
          city: vendorProfile?.city || '',
        }
      }
    })

    return NextResponse.json({
      query,
      products: formattedProducts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error("Search error:", error)
    return NextResponse.json({ error: "Failed to search products" }, { status: 500 })
  }
}


