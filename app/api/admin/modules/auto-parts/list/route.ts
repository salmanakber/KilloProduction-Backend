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
      autoPartsStore: {
        isNot: null, // just ensures store exists
      },
    }
    
    if (status && status !== "ALL") {
      if (status === "PENDING") {
        where.autoPartsStore = {
          is: {
            isVerified: false,
          },
        }
      } else if (status === "APPROVED") {
        where.autoPartsStore = {
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
      ]
    }

    const [stores, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          autoPartsStore: {
            include: {
              _count: {
                select: {
                  autoParts: true,
                },
              },
            },
          },
          vendorOrders: {
            where: {
              module: "AUTO_PARTS",
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
    const storeIds = stores.map(s => s.autoPartsStore?.id).filter(Boolean) as string[]
    const kycRejections = storeIds.length > 0 ? await prisma.kycRejection.findMany({
      where: {
        entityType: "AUTO_PARTS",
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
      const deliveredOrders = (store.vendorOrders || []).filter((order) => order.status === "DELIVERED")
      const totalRevenue = deliveredOrders.reduce((sum, order) => sum + order.total, 0)
      const totalOrders = deliveredOrders.length
      const storeId = store.autoPartsStore?.id || store.id
      const rejections = rejectionMap.get(storeId) || []

      return {
        id: storeId,
        userId: store.id,
        businessName: store.autoPartsStore?.storeName || store.name || "Unknown",
        businessType: "AUTO_PARTS_STORE", // You might want to add this field to the schema
        registrationNumber: store.autoPartsStore?.taxId || "",
        address: store.autoPartsStore?.address || "",
        status: store.autoPartsStore?.isVerified ? "APPROVED" : "PENDING",
        isVerified: store.autoPartsStore?.isVerified || false,
        specializations: [], // Add if you have this in schema
        brandsCarried: [], // Add if you have this in schema
        email: store.email || "",
        phone: store.phone || "",
        ownerName: store.name || "",
        registrationDate: store.createdAt.toISOString(),
        createdAt: store.createdAt.toISOString(),
        totalOrders,
        revenue: totalRevenue,
        totalProducts: store.autoPartsStore?._count?.autoParts || 0,
        documents: {
          businessLicense: store.autoPartsStore?.businessLicense || null,
          storeFront: store.autoPartsStore?.storeFront || null,
          inventory: store.autoPartsStore?.inventory || null,
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
    console.error("Error fetching riders:", error)
    return NextResponse.json({ error: "Failed to fetch riders" }, { status: 500 })
  }
}
