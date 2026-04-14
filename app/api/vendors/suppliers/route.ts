import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const category = searchParams.get("category")
    const verified = searchParams.get("verified")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    // Build where clause
    const where: any = {
      isVerified: true, // Only show verified wholesalers to vendors
      user: { isActive: true }
    }

    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { specialties: { array_contains: [search] } },
      ]
    }

    if (category) {
      where.wholesalerProducts = {
        some: {
          category: { equals: category, mode: "insensitive" },
          isActive: true
        }
      }
    }

    if (verified !== null) {
      where.isVerified = verified === "true"
    }

    // Get wholesalers with their products
    const [wholesalers, total] = await Promise.all([
      prisma.wholesaler.findMany({
        where,
        include: {
          wholesalerProducts: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              category: true,
              unitPrice: true,
              stock: true,
              form: true,
              dosage: true,
            },
            take: 5, // Limit products per wholesaler for mobile
          },
          _count: {
            select: {
              wholesalerProducts: true,
            },
          },
        },
        orderBy: [
          { rating: "desc" },
          { totalOrders: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.wholesaler.count({ where }),
    ])

    // Get available categories for filtering
    const categories = await prisma.wholesalerProduct.groupBy({
      by: ["category"],
      where: { isActive: true },
      _count: { category: true },
    })

    return NextResponse.json({
      suppliers: wholesalers.map(wholesaler => ({
        id: wholesaler.id,
        companyName: wholesaler.companyName,
        description: wholesaler.description,
        rating: wholesaler.rating,
        totalOrders: wholesaler.totalOrders,
        specialties: wholesaler.specialties,
        deliveryZones: wholesaler.deliveryZones,
        paymentTerms: wholesaler.paymentTerms,
        phone: wholesaler.phone,
        email: wholesaler.email,
        website: wholesaler.website,
        logo: wholesaler.logo,
        products: wholesaler.wholesalerProducts,
        totalProducts: wholesaler._count.wholesalerProducts,
        isVerified: wholesaler.isVerified,
      })),
      categories: categories.map(cat => ({
        name: cat.category,
        count: cat._count.category,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Suppliers fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch suppliers" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { supplierId, message, inquiryType } = body

    // Validate required fields
    if (!supplierId || !message || !inquiryType) {
      return NextResponse.json(
        { error: "Supplier ID, message, and inquiry type are required" },
        { status: 400 }
      )
    }

    // Check if supplier exists and is verified
    const supplier = await prisma.wholesaler.findUnique({
      where: { id: supplierId, isVerified: true },
    })

    if (!supplier) {
      return NextResponse.json(
        { error: "Supplier not found or not verified" },
        { status: 404 }
      )
    }

    // Get pharmacy details
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
    })

    if (!pharmacy) {
      return NextResponse.json(
        { error: "Pharmacy profile not found" },
        { status: 404 }
      )
    }

    // Create inquiry/contact record (you can extend this based on your needs)
    // For now, we'll just return success
    // In a real implementation, you might want to create a contact/inquiry table

    return NextResponse.json({
      message: "Inquiry sent successfully",
      supplier: {
        id: supplier.id,
        companyName: supplier.companyName,
        email: supplier.email,
        phone: supplier.phone,
      },
    })
  } catch (error) {
    console.error("Supplier inquiry error:", error)
    return NextResponse.json(
      { error: "Failed to send inquiry" },
      { status: 500 }
    )
  }
}
