import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const product = await prisma.product.findUnique({
      where: {
        id: params.id,
        type: 'AUTO_PART',
        isActive: true
      },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            isVerified: true,
            vendorProfile: {
              select: {
                businessName: true,
                logo: true,
                address: true,
                city: true,
                state: true,
                description: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    avatar: true,
                    reviews: true,
                  }
                }
              }
            }
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            description: true,
            icon: true,
          }
        },
        reviews: {
          include: {
            user: {
              select: {
                name: true,
                avatar: true,
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        _count: {
          select: {
            reviews: true
          }
        }
      }
    })
    

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    const avgRating = product.reviews.length > 0
      ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length
      : 4.5

    const vendorProfile = product.vendor.vendorProfile

    // Get related products (same category, different vendor)
    const relatedProducts = await prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        type: 'AUTO_PART',
        isActive: true,
        stockQuantity: { gt: 0 },
        id: { not: product.id },
        vendorId: { not: product.vendorId }
      },
      include: {
        vendor: {
          select: {
            vendorProfile: {
              select: {
                businessName: true,
                logo: true,
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
      take: 8,
      orderBy: { createdAt: 'desc' }
    })

    const formattedRelated = relatedProducts.map(p => {
      const rating = p.reviews.length > 0
        ? p.reviews.reduce((sum, r) => sum + r.rating, 0) / p.reviews.length
        : 4.5

      return {
        id: p.id,
        name: p.name,
        price: p.price,
        images: p.images,
        rating,
        reviews: p.reviews.length,
        store: {
          name: p.vendor.vendorProfile?.businessName || '',
          logo: p.vendor.vendorProfile?.logo,
        }
      }
    })

    return NextResponse.json({
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        compareAtPrice: product.comparePrice,
        images: product.images,
        stock: product.stockQuantity,
        rating: avgRating,
        reviews: product._count.reviews,
        category: {
          id: product.category?.id || '',
          name: product.category?.name || '',
          description: product.category?.description || '',
          icon: product.category?.icon || '',
        },
        brand: product.brand || '',
        sku: product.sku || '',
        specifications: product.specifications || {},
        store: {
          id: product.vendor.id,
          name: vendorProfile?.businessName || product.vendor.name || '',
          logo: vendorProfile?.logo,
          address: vendorProfile?.address || '',
          city: vendorProfile?.city || '',
          state: vendorProfile?.state || '',
          phone: product.vendor.phone || '',
          email: product.vendor.email || '',
          rating: vendorProfile?.user?.reviews.reduce((sum, r) => sum + r.rating, 0) / (vendorProfile?.user?.reviews.length || 1) || 4.5,
          totalReviews: vendorProfile?.user?.reviews.length || 0,
          isVerified: product.vendor.isVerified || false,
        },
        reviews: product.reviews.map(r => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment || '',
          user: {
            name: r.user?.name || 'Anonymous',
            avatar: r.user?.avatar,
          },
          createdAt: r.createdAt,
        }))
      },
      relatedProducts: formattedRelated
    })
  } catch (error) {
    console.error("Product details fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch product details" }, { status: 500 })
  }
}


