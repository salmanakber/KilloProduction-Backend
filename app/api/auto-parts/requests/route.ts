import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
import { emitAutoPartsRequestToVendor } from "@/lib/auto-parts-realtime"
import { cloudinary } from "@/lib/cloudinary"
import { enrichOffersWithLinkedProducts } from "@/lib/enrich-part-offers-products"

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Calculate seller relevance score
interface SellerScore {
  vendor: any
  score: number
  distance: number
  inventoryMatch: number
  responseRate: number
  rating: number
  specialization: number
}

async function calculateSellerScore(
  vendor: any,
  requestData: any,
  customerLat: number | null,
  customerLon: number | null
): Promise<SellerScore> {
  let score = 0
  let distance = Infinity
  let inventoryMatch = 0
  let responseRate = 0
  let rating = 0
  let specialization = 0

  // 1. Distance Weighting (0-40 points)
  const vendorProfile = vendor.vendorProfile as any
  if (customerLat && customerLon && vendorProfile?.latitude && vendorProfile?.longitude) {
    distance = calculateDistance(
      customerLat,
      customerLon,
      vendorProfile.latitude,
      vendorProfile.longitude
    )
    // Closer = higher score, max 40 points for < 5km
    if (distance <= 5) score += 40
    else if (distance <= 10) score += 30
    else if (distance <= 20) score += 20
    else if (distance <= 50) score += 10
    else score += 5
  } else if (vendorProfile?.city === requestData.city) {
    // Fallback: same city = 20 points
    score += 20
    distance = 0 // Unknown exact distance
  }

  // 1.5. Vehicle Make Match Bonus (0-15 points) - Additional bonus for matching makes
  const requestVehicleMake = (requestData.vehicleBrand || requestData.vehicleMake || '').toLowerCase().trim()
  if (requestVehicleMake && vendorProfile?.vehicleMakes && Array.isArray(vendorProfile.vehicleMakes)) {
    const vendorMakes = vendorProfile.vehicleMakes.map((make: string) => make.toLowerCase().trim())
    const hasMatchingMake = vendorMakes.some((make: string) => make === requestVehicleMake)
    if (hasMatchingMake) {
      // Bonus for matching vehicle make - vendors who explicitly list this make get priority
      score += 15
    }
  }

  // 2. Inventory Match (0-30 points)
  // Check if vendor has products matching the request
  const allProducts = await prisma.product.findMany({
    where: {
      vendorId: vendor.id,
      type: 'AUTO_PART',
      isActive: true,
      stockQuantity: { gt: 0 },
      OR: [
        { name: { contains: requestData.partName || '', mode: 'insensitive' } },
        { description: { contains: requestData.partName || '', mode: 'insensitive' } },
        { brand: { contains: requestData.vehicleBrand || requestData.vehicleMake || '', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      description: true,
    },
  })

  // Check vehicle compatibility match
  let matchingProducts = 0
  const requestMake = (requestData.vehicleMake || requestData.vehicleBrand || '').toLowerCase().trim()
  const requestModel = (requestData.vehicleModel || '').toLowerCase().trim()
  const requestYear = (requestData.vehicleYear || '').toLowerCase().trim()

  // Get full product data including vehicleCompatibilities
  const fullProducts = await prisma.product.findMany({
    where: {
      vendorId: vendor.id,
      type: 'AUTO_PART',
      isActive: true,
      stockQuantity: { gt: 0 },
      OR: [
        { name: { contains: requestData.partName || '', mode: 'insensitive' } },
        { description: { contains: requestData.partName || '', mode: 'insensitive' } },
        { brand: { contains: requestData.vehicleBrand || requestData.vehicleMake || '', mode: 'insensitive' } },
      ],
    },
  })

  for (const product of fullProducts) {
    let matches = false
    
    // Check if product name/description matches
    if (requestData.partName) {
      const partNameLower = requestData.partName.toLowerCase()
      if (
        product.name.toLowerCase().includes(partNameLower) ||
        (product.description && product.description.toLowerCase().includes(partNameLower))
      ) {
        matches = true
      }
    }

    // Check vehicle compatibility (using type assertion since Prisma types may not be updated yet)
    const productData = product as any
    const compatibilities = productData.vehicleCompatibilities
    if (compatibilities && Array.isArray(compatibilities)) {
      for (const compatibility of compatibilities) {
        const productMake = (compatibility.make || '').toLowerCase().trim()
        const productModel = (compatibility.model || '').toLowerCase().trim()
        const productYear = (compatibility.year || '').toLowerCase().trim()

        // Match make and model (year is optional but preferred)
        if (productMake === requestMake && productModel === requestModel) {
          matches = true
          // Bonus if year also matches
          if (productYear === requestYear && requestYear) {
            matchingProducts += 2 // Year match = 2 points
            break
          }
        }
      }
    } else {
      // Fallback: check brand field for legacy products
      if (requestMake && product.brand && product.brand.toLowerCase().includes(requestMake)) {
        matches = true
      }
    }

    if (matches) {
      matchingProducts += 1
    }
  }

  inventoryMatch = Math.min(30, matchingProducts * 5) // 5 points per matching product, max 30
  score += inventoryMatch

  // 3. Response Rate (0-15 points)
  // Check vendor's past offer response rate
  const totalOffers = await prisma.partOffer.count({
    where: { vendorId: vendor.id },
  })
  const acceptedOffers = await prisma.partOffer.count({
    where: {
      vendorId: vendor.id,
      status: 'ACCEPTED',
    },
  })
  if (totalOffers > 0) {
    responseRate = (acceptedOffers / totalOffers) * 15
    score += responseRate
  } else {
    responseRate = 5 // New vendors get 5 points
    score += responseRate
  }

  // 4. Rating (0-10 points)
  // Get vendor's average rating from reviews
  const reviews = await prisma.review.findMany({
    where: {
      targetId: vendor.id,
      targetType: 'VENDOR',
    },
    select: { rating: true },
  })
  if (reviews.length > 0) {
    rating = (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 2 // Max 10 points
    score += rating
  } else {
    rating = 3 // Default 3 points for unrated vendors
    score += rating
  }

  // 5. Specialization (0-5 points)
  // Check if vendor specializes in the requested category
  const categoryProducts = await prisma.product.count({
    where: {
      vendorId: vendor.id,
      type: 'AUTO_PART',
      isActive: true,
      category: requestData.category || requestData.partType ? {
        name: { contains: requestData.category || requestData.partType || '', mode: 'insensitive' },
      } : undefined,
    },
  })
  const totalProducts = await prisma.product.count({
    where: {
      vendorId: vendor.id,
      type: 'AUTO_PART',
      isActive: true,
    },
  })
  if (totalProducts > 0) {
    specialization = (categoryProducts / totalProducts) * 5
    score += specialization
  }

  // 6. Selling history / price vs customer max budget (0–8 points)
  const maxBudget = requestData.maxBudget
  if (typeof maxBudget === "number" && maxBudget > 0) {
    const avgAccepted = await prisma.partOffer.aggregate({
      where: { vendorId: vendor.id, status: "ACCEPTED" },
      _avg: { price: true },
    })
    const avg = avgAccepted._avg.price
    if (avg != null && avg > 0 && avg <= maxBudget) {
      score += Math.min(8, 8 * (1 - avg / maxBudget))
    } else if (avg == null || avg === 0) {
      score += 2
    }
  }

  return {
    vendor,
    score,
    distance,
    inventoryMatch,
    responseRate,
    rating,
    specialization,
  }
}

// Load balancing: Check if vendor has too many recent requests
async function checkLoadBalance(vendorId: string, maxRequestsPerHour: number = 5): Promise<boolean> {
  const oneHourAgo = new Date()
  oneHourAgo.setHours(oneHourAgo.getHours() - 1)

  const recentRequests = await prisma.partRequest.count({
    where: {
      offers: {
        some: {
          vendorId,
          createdAt: { gte: oneHourAgo },
        },
      },
    },
  })

  return recentRequests < maxRequestsPerHour
}

// Main seller matching function
async function findMatchingSellers(
  requestData: any,
  customerLat: number | null,
  customerLon: number | null,
  maxDistance: number = 50, // km
  maxSellers: number = 10
) {
  // Step 1: Filter vendors by basic criteria
  const vendorWhere: any = {
    role: 'VENDOR',
    isActive: true,
    vendorProfile: {
      isNot: null,
    },
    vendorProducts: {
      some: {
        type: 'AUTO_PART',
        isActive: true,
        stockQuantity: { gt: 0 },
      },
    },
  }

  // Filter by city if coordinates not available
  if (!customerLat || !customerLon) {
    if (requestData.city) {
      vendorWhere.vendorProfile = {
        is: {
          city: {
            contains: requestData.city,
            mode: 'insensitive',
          },
        },
      }
    }
  }

  const vendors = await prisma.user.findMany({
    where: vendorWhere,
    include: {
      vendorProfile: true, // Select all fields to include vehicleMakes and categories
      vendorProducts: {
        where: {
          type: 'AUTO_PART',
          isActive: true,
        },
        select: {
          id: true,
          categoryId: true,
        },
      },
    },
  })

  // Type assertion to handle vendorProfile access
  const vendorsWithProfile = vendors.filter((v: any) => v.vendorProfile !== null) as any[]

  // Get request vehicle make for filtering
  const requestVehicleMake = (requestData.vehicleBrand || requestData.vehicleMake || '').toLowerCase().trim()
  const requestCategory = requestData.category || requestData.partType || ''

  // Step 2: Calculate scores for all vendors
  const scoredSellers: SellerScore[] = []
  for (const vendor of vendorsWithProfile) {
    // Check load balancing
    const canAccept = await checkLoadBalance(vendor.id)
    if (!canAccept) continue

    // Filter by distance if coordinates available
    const vendorProfile = vendor.vendorProfile as any
    if (customerLat && customerLon && vendorProfile?.latitude && vendorProfile?.longitude) {
      const distance = calculateDistance(
        customerLat,
        customerLon,
        vendorProfile.latitude,
        vendorProfile.longitude
      )
      if (distance > maxDistance) continue
    }

    // Filter by vehicle makes if vendor has makes specified and request has a vehicle make
    // Only filter if vendor has explicitly set vehicle makes (backward compatibility)
    if (requestVehicleMake && vendorProfile?.vehicleMakes && Array.isArray(vendorProfile.vehicleMakes)) {
      const vendorMakes = vendorProfile.vehicleMakes.map((make: string) => make.toLowerCase().trim())
      const hasMatchingMake = vendorMakes.some((make: string) => make === requestVehicleMake)
      
      // If vendor has specified makes but none match, skip this vendor
      // This allows vendors to be selective about which makes they serve
      if (!hasMatchingMake) {
        continue
      }
    }

    // Filter by categories if vendor has categories specified and request has a category
    if (requestCategory && vendorProfile?.categories && Array.isArray(vendorProfile.categories)) {
      // Categories are stored as IDs, so we'd need to check if requestCategory matches
      // For now, we'll skip strict category filtering and use it in scoring instead
      // This allows more flexibility
    }

    const sellerScore = await calculateSellerScore(vendor, requestData, customerLat, customerLon)
    scoredSellers.push(sellerScore)
  }

  // Step 3: Sort by score and return top N
  scoredSellers.sort((a, b) => b.score - a.score)
  return scoredSellers.slice(0, maxSellers)
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") 
    
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {}

    if (user.role === "CUSTOMER") {
      where.userId = user.id
      // Customers can see all their requests including CLOSED ones
      // Only filter by status if explicitly provided
    } else if (user.role === "VENDOR") {
      // Vendors can see all open requests
      where.status = "OPEN"
    }

    if (status) {
      where.status = status
    }
    where.orders = {
      some: {
        status: {
          notIn: ["CANCELLED", "COMPLETED", "REFUNDED", "DELIVERED"]
        }
      }
    }

    const [requests, total] = await Promise.all([
      prisma.partRequest.findMany({
        where,
        include: {
          user: {
            select: {
              name: true,
              phone: true,
              addresses: {
                where: { isDefault: true },
                select: {
                  latitude: true,
                  longitude: true,
                  city: true,
                },
                take: 1,
              },
            },
          },
          offers: {
            include: {
              vendor: {
                select: {
                  name: true,
                  vendorProfile: {
                    select: {
                      businessName: true,
                      logo: true,
                      latitude: true,
                      longitude: true,
                      address: true,
                      user: {
                        select: {
                          id: true,
                          name: true,
                          phone: true,
                          addresses: {
                            where: { isDefault: true },
                            select: { latitude: true, longitude: true, city: true },
                          },
                          reviews: true,
                        },
                      }
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
          _count: {
            select: {
              offers: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.partRequest.count({ where }),
    ])

    const allOffers = requests.flatMap((r) => r.offers || [])
    if (allOffers.length > 0) {
      const enriched = await enrichOffersWithLinkedProducts(allOffers)
      const byId = new Map(enriched.map((o) => [o.id, o]))
      for (const r of requests) {
        if (r.offers?.length) {
          r.offers = r.offers.map((o) => byId.get(o.id) || { ...o, linkedProduct: null })
        }
      }
    }

    return NextResponse.json({
      requests,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Part requests fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch part requests" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const contentType = request.headers.get("content-type")
    let data: any = {}
    let uploadedImages: string[] = []

    // Handle FormData (for image uploads) or JSON
    if (contentType && contentType.includes("multipart/form-data")) {
      const formData = await request.formData()
      
      // Extract text fields
      data.partName = formData.get("partName") as string
      data.vehicleMake = formData.get("vehicleMake") as string
      data.vehicleModel = formData.get("vehicleModel") as string
      data.vehicleYear = formData.get("vehicleYear") as string
      data.category = formData.get("category") as string
      data.partType = formData.get("partType") as string
      data.description = formData.get("description") as string
      data.urgency = formData.get("urgency") as string
      data.maxBudget = formData.get("maxBudget") as string
      data.preferredCondition = formData.get("preferredCondition") as string
      data.needsMechanic = formData.get("needsMechanic") === "true"
      data.latitude = formData.get("latitude") as string
      data.longitude = formData.get("longitude") as string
      data.city = formData.get("city") as string

      // Handle image uploads
      const imageFiles = formData.getAll("images") as File[]
      
      if (imageFiles.length > 0) {
        console.log(`📤 Uploading ${imageFiles.length} images to Cloudinary...`)
        
        for (const imageFile of imageFiles) {
          if (imageFile && imageFile.size > 0) {
            try {
              // Validate file type
              const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
              if (!allowedTypes.includes(imageFile.type)) {
                console.warn(`Skipping invalid file type: ${imageFile.type}`)
                continue
              }

              // Validate file size (max 5MB)
              const maxSize = 5 * 1024 * 1024 // 5MB
              if (imageFile.size > maxSize) {
                console.warn(`Skipping file too large: ${imageFile.size} bytes`)
                continue
              }

              // Convert to buffer and upload
              const imageBuffer = Buffer.from(await imageFile.arrayBuffer())
              const imageBase64 = imageBuffer.toString('base64')
              
              const uploadResult = await cloudinary.uploader.upload(
                `data:${imageFile.type};base64,${imageBase64}`,
                {
                  folder: 'auto-parts/part-requests',
                  resource_type: 'image',
                  transformation: [
                    { quality: 'auto', fetch_format: 'auto' },
                    { width: 1200, height: 1200, crop: 'limit' }
                  ]
                }
              )
              
              uploadedImages.push(uploadResult.secure_url)
              console.log(`✅ Uploaded image: ${uploadResult.secure_url}`)
            } catch (uploadError) {
              console.error('Image upload error:', uploadError)
              // Continue with other images even if one fails
            }
          }
        }
      }
    } else {
      // Handle JSON request
      data = await request.json()
      // If images are provided as URLs in JSON, use them directly
      if (data.images && Array.isArray(data.images)) {
        uploadedImages = data.images.filter((img: any) => typeof img === 'string')
      }
      // Ensure needsMechanic is boolean
      if (data.needsMechanic !== undefined) {
        data.needsMechanic = data.needsMechanic === true || data.needsMechanic === "true"
      }
    }

    // Validate required fields
    if (!data.partName || !data.vehicleMake || !data.vehicleModel) {
      return NextResponse.json(
        { error: "partName, vehicleMake, and vehicleModel are required" },
        { status: 400 }
      )
    }

    // Set expiry date (default 7 days from now)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // Get customer location if available
    const customerLat = data.latitude ? parseFloat(data.latitude) : null
    const customerLon = data.longitude ? parseFloat(data.longitude) : null

    // Get customer default address for order
    const defaultAddress = await prisma.address.findFirst({
      where: {
        userId: user.id,
        isDefault: true,
      },
    })

    // Generate order number
    const generateOrderNumber = (): string => {
      return `AP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    // Create order and part request in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create part request first
      const partRequest = await tx.partRequest.create({
        data: {
          userId: user.id,
          vehicleBrand: data.vehicleMake,
          vehicleModel: data.vehicleModel,
          vehicleYear: data.vehicleYear || "",
          partType: data.category || data.partType || "",
          partName: data.partName,
          description: data.description || "",
          urgency: data.urgency || "MEDIUM",
          maxBudget: data.maxBudget ? parseFloat(data.maxBudget) : null,
          preferredCondition: data.preferredCondition || null,
          images: uploadedImages.length > 0 ? uploadedImages as any : null,
          needsMechanic: data.needsMechanic === true || data.needsMechanic === "true" || false,
          status: "OPEN",
          expiresAt,
        } as any,
        include: {
          user: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      })

      // Draft order: hidden from customer lists until a vendor offer is accepted (then PENDING + totals).
      const orderNumber = generateOrderNumber()
      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId: user.id,
          vendorId: null, // Will be set when offer is accepted
          addressId: defaultAddress?.id || null,
          module: "AUTO_PARTS",
          partRequestId: partRequest.id, // Link order to part request
          status: "DRAFT",
          subtotal: 0,
          deliveryFee: 0,
          serviceFee: 0,
          tax: 0,
          discount: 0,
          total: 0,
          vendorCommission: 0,
          platformCommission: 0,
          paymentStatus: "PENDING",
          notes: `Draft part request order for ${data.partName} - ${data.vehicleMake} ${data.vehicleModel}`,
          orderTracking: {
            create: {
              status: "DRAFT",
              notes: "Draft order — waiting for a matching vendor offer.",
            },
          },
        },
      })

      return { partRequest, order }
    })

    const { partRequest, order } = result

    // Find and notify matching sellers using intelligent matching
    let matchingSellers: SellerScore[] = []
    try {
      matchingSellers = await findMatchingSellers(
        {
          partName: data.partName,
          vehicleBrand: data.vehicleMake,
          category: data.category,
          partType: data.partType,
          city: data.city,
        },
        customerLat,
        customerLon,
        data.maxDistance || 50, // Default 50km radius
        data.maxSellers || 10 // Default top 10 sellers
      )

      // Create notifications for top sellers
      const notifications = matchingSellers.map((seller) => ({
        userId: seller.vendor.id,
        title: "New Part Request",
        message: `New request for ${data.partName} - ${data.vehicleBrand} ${data.vehicleModel}`,
        type: "AUTO_PARTS_REQUEST",
        module: "AUTO_PARTS",
        data: {
          requestId: partRequest.id,
          partName: data.partName,
          vehicleBrand: data.vehicleBrand,
          vehicleModel: data.vehicleModel,
          score: seller.score,
          distance: seller.distance,
        },
        isRead: false,
      }))

      // Batch create notifications
      await NotificationBridge.sendBulkNotifications(notifications.map((notification) => notification.userId), {
        title: "New Part Request",
        message: `New request for ${data.partName} - ${data.vehicleBrand} ${data.vehicleModel}`,
        type: "AUTO_PARTS_REQUEST",
        module: "AUTO_PARTS",
        actionUrl: `/vendor/auto-parts/part-offer?requestId=${encodeURIComponent(partRequest.id)}`,
        data: {
          actionType: "navigate",
          screen: "PartOfferScreen",
          requestId: partRequest.id,
          partRequestId: partRequest.id,
          params: [
            {
              name: "requestId",
              value: partRequest.id,
            },
          ],
        },
      })

      for (const seller of matchingSellers) {
        emitAutoPartsRequestToVendor(seller.vendor.id, partRequest.id)
      }

      console.log(`✅ Notified ${matchingSellers.length} sellers for part request ${partRequest.id}`)
    } catch (matchingError) {
      console.error("Error in seller matching:", matchingError)
      // Don't fail the request creation if matching fails
    }

    return NextResponse.json(
      {
        ...partRequest,
        orderId: order.id,
        orderNumber: order.orderNumber,
        message: `Request created. ${matchingSellers.length} sellers notified.`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Part request creation error:", error)
    return NextResponse.json({ error: "Failed to create part request" }, { status: 500 })
  }
}
