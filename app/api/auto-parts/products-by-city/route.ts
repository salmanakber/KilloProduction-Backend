import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const city = searchParams.get("city")
    const search = searchParams.get("search")
    const category = searchParams.get("category")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    // Build where clause
    const where: any = {
      type: "AUTO_PART", // Filter by product type
      isActive: true,
      stockQuantity: { gt: 0 },
    }

    // Filter by vendor city if provided
    if (city) {
      where.vendor = {
        vendorProfile: {
          city: {
            contains: city,
            mode: "insensitive",
          },
        },
      }
    }

    // Search filter
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
      ]
    }

    // Category filter
    if (category) {
      where.categoryId = category
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              vendorProfile: {
                select: {
                  id: true,
                  businessName: true,
                  city: true,
                  state: true,
                  address: true,
                  logo: true,
                },
              },
            },
          },
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          reviews: {
            select: {
              rating: true,
            },
          },
        },
        orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ])

    // Format products to match expected structure
    const formattedProducts = products.map((product) => {
      const avgRating =
        product.reviews.length > 0
          ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length
          : 4.5

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        comparePrice: product.comparePrice,
        stock: product.stockQuantity,
        images: product.images,
        brand: product.brand,
        sku: product.sku,
        rating: avgRating,
        reviews: product.reviews.length,
        category: product.category,
        vendor: {
          id: product.vendor.id,
          name: product.vendor.name,
          vendorProfile: product.vendor.vendorProfile
            ? {
                businessName: product.vendor.vendorProfile.businessName,
                city: product.vendor.vendorProfile.city,
                state: product.vendor.vendorProfile.state,
                address: product.vendor.vendorProfile.address,
                logo: product.vendor.vendorProfile.logo,
              }
            : null,
        },
      }
    })

    return NextResponse.json({
      products: formattedProducts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Products by city fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
  }
}


