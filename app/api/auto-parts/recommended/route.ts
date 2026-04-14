import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const { searchParams } = new URL(request.url)
    const city = searchParams.get('city') // City filter
    const limit = parseInt(searchParams.get('limit') || '10')

    let recommendedParts = []

    if (user) {
      // Get user's order history to recommend similar parts
      const userOrders = await prisma.order.findMany({
        where: {
          customerId: user.id,
          module: 'AUTO_PARTS',
          status: { in: ['DELIVERED', 'CONFIRMED'] }
        },
        include: {
          orderItems: {
            include: {
              order: {
                include: {
                  autoPart: {
                    select: {
                      category: true,
                      partType: true,
                      brand: true,
                      model: true,
                      year: true,
                    }
                  }
                }
              }
            }
          }
        },
        take: 10,
        orderBy: { createdAt: 'desc' }
      })

      // Extract user preferences
      const categories = new Set<string>()
      const partTypes = new Set<string>()
      const brands = new Set<string>()

      userOrders.forEach(order => {
        order.orderItems.forEach(item => {
          if (item.order.autoPart) {
            categories.add(item.order.autoPart.category)
            partTypes.add(item.order.autoPart.partType)
            brands.add(item.order.autoPart.brand)
          }
        })
      })

      // Build where clause for products
      const productWhere: any = {
        type: 'AUTO_PART',
        isActive: true,
        stockQuantity: { gt: 0 },
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

      // Get recommended parts based on user preferences
      if (categories.size > 0 || brands.size > 0) {
        recommendedParts = await prisma.product.findMany({
          where: {
            ...productWhere,
            OR: [
              { category: { name: { in: Array.from(categories) } } },
              { brand: { in: Array.from(brands) } },
            ]
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
          take: limit,
          orderBy: [
            { isFeatured: 'desc' },
            { rating: 'desc' },
            { createdAt: 'desc' }
          ]
        })
      }
    }

    // If no recommendations based on history, show featured parts
    if (recommendedParts.length === 0) {
      const productWhere: any = {
        type: 'AUTO_PART',
        isActive: true,
        isFeatured: true,
        stockQuantity: { gt: 0 }
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

      recommendedParts = await prisma.product.findMany({
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
                  state: true,
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
        take: limit,
        orderBy: { createdAt: 'desc' }
      })
    }

    const formattedParts = recommendedParts.map((part: any) => {
      const avgRating = part.reviews.length > 0
        ? part.reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / part.reviews.length
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

    return NextResponse.json({
      parts: formattedParts,
    })
  } catch (error) {
    console.error("Recommended parts fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch recommended parts" }, { status: 500 })
  }
}

