import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

// Spam prevention constants
const MAX_SUBMISSIONS_PER_HOUR = 10
const MIN_PRICE = 2
const SPAM_KEYWORDS = ['test', 'aaa', 'random', 'spam', 'fake', 'placeholder' ,'xxx','yyy','zzz' ,'111','222','333','444','555','666','777','888','999','000','www','qqq','rrr','sss','ttt','uuu','vvv','www','xxx','yyy','zzz','111','222','333','444','555','666','777','888','999','000']
const ALLOWED_IMAGE_FORMATS = ['image/jpeg', 'image/jpg', 'image/png']

// Rate limiting storage (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

// Check for repeated keywords
function hasRepeatedKeywords(text: string): boolean {
  const lowerText = text.toLowerCase()
  for (const keyword of SPAM_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
    const matches = lowerText.match(regex)
    if (matches && matches.length >= 3) {
      return true
    }
  }
  // Check for repeated single characters
  const repeatedPattern = /(.)\1{4,}/g
  if (repeatedPattern.test(lowerText)) {
    return true
  }
  return false
}

// Check rate limiting
function checkRateLimit(identifier: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const oneHour = 60 * 60 * 1000
  const record = rateLimitMap.get(identifier)

  if (!record || now > record.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + oneHour })
    return { allowed: true, remaining: MAX_SUBMISSIONS_PER_HOUR - 1 }
  }

  if (record.count >= MAX_SUBMISSIONS_PER_HOUR) {
    return { allowed: false, remaining: 0 }
  }

  record.count += 1
  rateLimitMap.set(identifier, record)
  return { allowed: true, remaining: MAX_SUBMISSIONS_PER_HOUR - record.count }
}

// Get client IP
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return request.headers.get('x-real-ip') || 'unknown'
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "20")
    const skip = (page - 1) * limit
    const search = searchParams.get("search")
    const categoryId = searchParams.get("categoryId")
    const status = searchParams.get("status") // "active", "inactive", "out_of_stock"

    const where: any = {
      vendorId: user.id,
      type: "AUTO_PART",
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
      ]
    }

    if (categoryId) {
      where.categoryId = categoryId
    }

    if (status === "active") {
      where.isActive = true
      where.stockQuantity = { gt: 0 }
    } else if (status === "inactive") {
      where.isActive = false
    } else if (status === "out_of_stock") {
      where.stockQuantity = { lte: 0 }
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: {
            select: {
              name: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.product.count({ where }),
    ])

    // Get product IDs to count order items
    const productIds = products.map(p => p.id)
    
    // Count order items for these products (since there's no direct relation in schema)
    const orderItemCountsMap = new Map<string, number>()
    if (productIds.length > 0) {
      const counts = await prisma.orderItem.groupBy({
        by: ['productId'],
        where: {
          productId: { in: productIds },
        },
        _count: {
          productId: true,
        },
      })
      
      counts.forEach(item => {
        orderItemCountsMap.set(item.productId, item._count.productId)
      })
    }

    return NextResponse.json({
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        comparePrice: product.comparePrice,
        stockQuantity: product.stockQuantity,
        images: product.images,
        brand: product.brand,
        sku: product.sku,
        isActive: product.isActive,
        isFeatured: product.isFeatured,
        category: product.category?.name || "",
        salesCount: orderItemCountsMap.get(product.id) || 0,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Products fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()

    // Validate required fields
    if (!data.name || !data.price || !data.categoryId) {
      return NextResponse.json({ error: "name, price, and categoryId are required" }, { status: 400 })
    }

    // 1. Rate limiting check (IP-based)
    const clientIP = getClientIP(request)
    const rateLimitKey = `product_submission_${user.id}_${clientIP}`
    const rateLimit = checkRateLimit(rateLimitKey)
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          error: "Rate limit exceeded", 
          message: `You can only submit ${MAX_SUBMISSIONS_PER_HOUR} products per hour. Please try again later.`,
          remaining: 0
        },
        { status: 429 }
      )
    }

    // 2. Price validation - prevent $0 or $1 spam
    const price = parseFloat(data.price)
    if (isNaN(price) || price < MIN_PRICE) {
      
      return NextResponse.json(
        { error: `Price must be at least $${MIN_PRICE}` },
        { status: 400 }
      )
    }

    // 3. Spam keyword detection in title
    if (hasRepeatedKeywords(data.name)) {
      
      return NextResponse.json(
        { error: "Product name contains spam keywords or repeated characters" },
        { status: 400 }
      )
    }

    // 4. Spam keyword detection in description
    if (data.description && hasRepeatedKeywords(data.description)) {
      return NextResponse.json(
        { error: "Description contains spam keywords or repeated characters" },
        { status: 400 }
      )
    }

    // 5. Check for duplicate listings from same vendor
    const duplicateCheck = await prisma.product.findFirst({
      where: {
        vendorId: user.id,
        type: "AUTO_PART",
        name: { equals: data.name.trim(), mode: "insensitive" },
        brand: data.brand ? { equals: data.brand.trim(), mode: "insensitive" } : undefined,
        // Check if created within last 24 hours
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    })

    if (duplicateCheck) {
      return NextResponse.json(
        { error: "A similar product listing already exists. Please wait 24 hours before creating a duplicate." },
        { status: 400 }
      )
    }

    // 6. Image validation
    if (data.images && Array.isArray(data.images)) {
      // Validate image formats (basic check - full validation should be done during upload)
      for (const imageUrl of data.images) {
        if (typeof imageUrl === 'string') {
          const extension = imageUrl.split('.').pop()?.toLowerCase()
          if (extension && !['jpg', 'jpeg', 'png'].includes(extension)) {
            return NextResponse.json(
              { error: "Only JPG and PNG images are allowed" },
              { status: 400 }
            )
          }
        }
      }
    }

    // 7. Count vendor's existing products to determine if manual approval needed
    const vendorProductCount = await prisma.product.count({
      where: {
        vendorId: user.id,
        type: "AUTO_PART"
      }
    })

    // First 10 products require manual approval
    const requiresApproval = vendorProductCount < 10

    // Create product
    const product = await prisma.product.create({
      data: {
        vendorId: user.id,
        type: "AUTO_PART",
        name: data.name.trim(),
        description: (data.description || "").trim(),
        price: price,
        comparePrice: data.comparePrice ? parseFloat(data.comparePrice) : null,
        stockQuantity: parseInt(data.stockQuantity || "0"),
        categoryId: data.categoryId,
        brand: (data.brand || "").trim(),
        sku: (data.sku || "").trim(),
        images: data.images || [],
        isActive: requiresApproval ? false : (data.isActive !== false), // First 10 products inactive until approval
        isFeatured: data.isFeatured || false,
        // Store additional fields if schema supports them
        ...(data.warranty && { warranty: data.warranty }),
        ...(data.returnPolicy && { returnPolicy: data.returnPolicy }),
        // Store vehicle compatibilities as JSON array
        ...(data.vehicleCompatibilities && Array.isArray(data.vehicleCompatibilities) && data.vehicleCompatibilities.length > 0 && {
          vehicleCompatibilities: data.vehicleCompatibilities
        }),
      },
    })

    return NextResponse.json({ 
      product,
      requiresApproval,
      message: requiresApproval 
        ? "Product submitted for manual approval. It will be published after review." 
        : "Product created successfully"
    }, { status: 201 })
  } catch (error: any) {
    console.error("Product creation error:", error)
    
    // Handle duplicate key errors
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: "A product with similar details already exists" },
        { status: 400 }
      )
    }
    
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 })
  }
}

