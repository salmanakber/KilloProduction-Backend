import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    // Check if pharmacy is verified
    if (!pharmacy.isVerified) {
      return NextResponse.json({ 
        error: "Pharmacy account must be verified before accessing wholesaler products",
        code: "VERIFICATION_REQUIRED"
      }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")
    const search = searchParams.get("search")
    const category = searchParams.get("category")
    const wholesalerId = searchParams.get("wholesalerId")
    const minPrice = searchParams.get("minPrice")
    const maxPrice = searchParams.get("maxPrice")
    const sortBy = searchParams.get("sortBy") || "name"
    const sortOrder = searchParams.get("sortOrder") || "asc"

    // Build where clause for wholesaler products
    const where: any = {
      isActive: true,
      stock: { gt: 0 }, // Only show products with stock
      expiryDate: { gt: new Date() }, // Only show non-expired products
      wholesaler: {
        isVerified: true, // Only show products from verified wholesalers
        user: {
          isActive: true
        }
      }
    }

    // Filter by specific wholesaler if provided
    if (wholesalerId) {
      where.wholesalerId = wholesalerId
    }

    // Search functionality
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { genericName: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
        { manufacturer: { contains: search, mode: "insensitive" } },
        { wholesaler: { companyName: { contains: search, mode: "insensitive" } } },
      ]
    }

    // Filter by category
    if (category) {
      where.category = category
    }

    // Price range filter
    if (minPrice) {
      where.unitPrice = { ...where.unitPrice, gte: Number.parseFloat(minPrice) }
    }
    if (maxPrice) {
      where.unitPrice = { ...where.unitPrice, lte: Number.parseFloat(maxPrice) }
    }

    // Build orderBy clause
    const orderBy: any = {}
    if (sortBy === "price") {
      orderBy.unitPrice = sortOrder
    } else if (sortBy === "name") {
      orderBy.name = sortOrder
    } else if (sortBy === "expiry") {
      orderBy.expiryDate = sortOrder
    } else if (sortBy === "rating") {
      orderBy.wholesaler = { rating: sortOrder }
    } else {
      orderBy.name = "asc"
    }

    const [products, total] = await Promise.all([
      prisma.wholesalerProduct.findMany({
        where,
        include: {
          wholesaler: {
            select: {
              id: true,
              companyName: true,
              rating: true,
              totalOrders: true,
              deliveryZones: true,
              paymentTerms: true,
              user: {
                select: {
                  name: true,
                  email: true,
                  phone: true,
                }
              }
            }
          }
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.wholesalerProduct.count({ where }),
    ])

    // Add additional metadata to products
    const productsWithMetadata = products.map(product => ({
      ...product,
      wholesalerInfo: {
        id: product.wholesaler.id,
        companyName: product.wholesaler.companyName,
        rating: product.wholesaler.rating,
        totalOrders: product.wholesaler.totalOrders,
        deliveryZones: product.wholesaler.deliveryZones,
        paymentTerms: product.wholesaler.paymentTerms,
        contact: {
          name: product.wholesaler.user.name,
          email: product.wholesaler.user.email,
          phone: product.wholesaler.user.phone,
        }
      }
    }))

    return NextResponse.json({
      products: productsWithMetadata,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Wholesaler products fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch wholesaler products" }, { status: 500 })
  }
}
