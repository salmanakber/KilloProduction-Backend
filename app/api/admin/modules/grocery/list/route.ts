import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")
    const status = searchParams.get("status")
    const search = searchParams.get("search")

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {
      role: "VENDOR",
      groceryStore: {
        isNot: null,
      },
    }

    if (status && status !== "ALL") {
      if (status === "PENDING") {
        where.groceryStore = {
          is: {
            isVerified: false,
          },
        }
      } else if (status === "APPROVED") {
        where.groceryStore = {
          is: {
            isVerified: true,
          },
        }
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { groceryStore: { storeName: { contains: search, mode: "insensitive" } } },
      ]
    }

    const [stores, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          groceryStore: {
            include: {
              _count: {
                select: {
                  products: true,
                },
              },
            },
          },
          vendorOrders: {
            where: {
              module: "GROCERY",
            },
            select: {
              id: true,
              total: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ])

    // Fetch all KycRejections for the fetched stores
    const storeIds = stores.map(s => s.groceryStore?.id).filter(Boolean) as string[]
    const kycRejections = storeIds.length > 0 ? await prisma.kycRejection.findMany({
      where: {
        entityType: "GROCERY",
        entityId: { in: storeIds },
      },
      include: {
        rejectedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { rejectedAt: "desc" },
    }) : []
    
    // Create a map of entityId to rejections
    const rejectionMap = new Map<string, typeof kycRejections>()
    kycRejections.forEach(rejection => {
      if (!rejectionMap.has(rejection.entityId)) {
        rejectionMap.set(rejection.entityId, [])
      }
      rejectionMap.get(rejection.entityId)!.push(rejection)
    })

    const formattedStores = stores.map((store) => {
      const totalRevenue = store.vendorOrders?.reduce((sum, order) => sum + order.total, 0) || 0
      const totalOrders = store.vendorOrders?.length || 0
      const storeId = store.groceryStore?.id || store.id
      const rejections = rejectionMap.get(storeId) || []

      return {
        id: storeId,
        userId: store.id,
        storeName: store.groceryStore?.storeName || store.name || "Unknown",
        email: store.email || "",
        phone: store.phone || "",
        address: store.groceryStore?.address || "",
        storeType: (store.groceryStore?.storeType as string[]) || [],
        status: store.groceryStore?.isVerified ? "APPROVED" : "PENDING",
        isVerified: store.groceryStore?.isVerified || false,
        isOpen: store.groceryStore?.isOpen || false,
        rating: store.groceryStore?.rating || 0,
        totalOrders,
        revenue: totalRevenue,
        totalProducts: store.groceryStore?._count?.products || 0,
        createdAt: store.createdAt.toISOString(),
        joinedAt: store.createdAt.toISOString(),
        logo: store.groceryStore?.logo,
        registrationNumber: store.groceryStore?.businessRegistration || "",
        description: store.groceryStore?.description || "",
        coverImage: store.groceryStore?.coverImage,
        deliveryFee: store.groceryStore?.deliveryFee || 0,
        minOrderAmount: store.groceryStore?.minOrderAmount || 0,
        maxDeliveryDistance: store.groceryStore?.maxDeliveryDistance || 0,
        documents: {
          businessLicense: store.groceryStore?.businessLicense || null,
          tradeLicense: store.groceryStore?.tradeLicense || null,
          storeFront: store.groceryStore?.storeFront || null,
          storeInterior: store.groceryStore?.storeInterior || null,
          productSample: store.groceryStore?.productSample || null,
        },
        rejectionHistory: rejections.map(r => ({
          id: r.id,
          rejectionReason: r.rejectionReason,
          rejectedFields: r.rejectedFields,
          rejectedBy: r.rejectedByUser?.name || "Unknown Admin",
          rejectedAt: r.rejectedAt.toISOString(),
          isResolved: r.isResolved,
        })),
      }
    })

    return NextResponse.json({
      stores: formattedStores,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching grocery stores:", error)
    return NextResponse.json({ error: "Failed to fetch grocery stores" }, { status: 500 })
  }
}
