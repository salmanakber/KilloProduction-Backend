import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "WHOLESALER" as any) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
      include: {
        user: {
          include: {
            userProfile: true,
          },
        },
      },
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    // Get dashboard analytics
    const [totalOrders, totalRevenue, totalProducts, pendingOrders, recentOrders, topProducts, monthlyRevenue] =
      await Promise.all([
        // Total orders
        prisma.supplierOrder.count({
          where: { wholesalerId: wholesaler.id },
        }),

        // Total revenue
        prisma.supplierOrder.aggregate({
          where: {
            wholesalerId: wholesaler.id,
            status: "DELIVERED",
          },
          _sum: { totalAmount: true },
        }),

        // Total products
        prisma.wholesalerProduct.count({
          where: { wholesalerId: wholesaler.id },
        }),

        // Pending orders
        prisma.supplierOrder.count({
          where: {
            wholesalerId: wholesaler.id,
            status: { in: ["PENDING", "CONFIRMED"] },
          },
        }),

        // Recent orders
        prisma.supplierOrder.findMany({
          where: { wholesalerId: wholesaler.id },
          include: {
            pharmacy: {
              select: {
                pharmacyName: true,
                phone: true,
              },
            },
            items: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),

        // Top selling products
        prisma.supplierOrderItem.groupBy({
          by: ["productId"],
          where: {
            supplierOrder: {
              wholesalerId: wholesaler.id,
              status: "DELIVERED",
            },
          },
          _sum: { quantity: true },
          _count: { productId: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: 5,
        }),

        // Monthly revenue - using Prisma models instead of raw SQL
        prisma.supplierOrder.findMany({
          where: {
            wholesalerId: wholesaler.id,
            status: "DELIVERED",
            createdAt: {
              gte: new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000), // 12 months ago
            },
          },
          select: {
            totalAmount: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
      ])

    // Get product details for top products
    const topProductsWithDetails = await Promise.all(
      topProducts.map(async (item) => {
        try {
          const product = await prisma.wholesalerProduct.findUnique({
            where: { id: item.productId },
            select: { name: true, unitPrice: true, countryOfOrigin: true },
          })
          return {
            ...product,
            totalSold: item._sum.quantity || 0,
            orderCount: item._count.productId || 0,
          }
        } catch (error) {
          console.error(`Error fetching product ${item.productId}:`, error)
          return {
            name: "Unknown Product",
            unitPrice: 0,
            countryOfOrigin: "Unknown",
            totalSold: item._sum.quantity || 0,
            orderCount: item._count.productId || 0,
          }
        }
      }),
    )

    // Process monthly revenue data using Prisma results
    const monthlyRevenueData = monthlyRevenue.reduce((acc: any, order: any) => {
      try {
        const month = order.createdAt.toISOString().slice(0, 7) // YYYY-MM format
        if (!acc[month]) {
          acc[month] = { month, revenue: 0, orders: 0 }
        }
        acc[month].revenue += order.totalAmount || 0
        acc[month].orders += 1
        return acc
      } catch (error) {
        console.error("Error processing monthly revenue:", error)
        return acc
      }
    }, {})

    const monthlyRevenueArray = Object.values(monthlyRevenueData).sort((a: any, b: any) => 
      b.month.localeCompare(a.month)
    )

    // Get active pharmacies count
    const activePharmacies = await prisma.supplierOrder.groupBy({
      by: ['pharmacyId'],
      where: {
        wholesalerId: wholesaler.id,
        status: "DELIVERED",
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
      _count: { pharmacyId: true },
    })

    // Get country origins from products
    const countryOrigins = await prisma.wholesalerProduct.groupBy({
      by: ['countryOfOrigin'],
      where: { wholesalerId: wholesaler.id },
      _count: { countryOfOrigin: true },
    })

    // Get expiring batches (products expiring within 60 days)
    const expiringBatches = await prisma.wholesalerProduct.findMany({
      where: {
        wholesalerId: wholesaler.id,
        expiryDate: {
          gte: new Date(),
          lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // Within 60 days
        },
        stock: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        batchNumber: true,
        stock: true,
        expiryDate: true,
      },
      orderBy: { expiryDate: "asc" },
      take: 5,
    })

    // Get real pharmacy quote requests using the correct wholesaler field
    const pharmacyRequests = await prisma.supplierOrder.findMany({
      where: {
        wholesalerId: wholesaler.id,
        isQuote: true,
        status: "QUOTE_SENT" as any,
      },
      include: {
        pharmacy: {
          select: {
            pharmacyName: true,
            phone: true,
          },
        },
        items: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    })
    


    return NextResponse.json({
      analytics: {
        totalOrders: totalOrders || 0,
        totalRevenue: totalRevenue._sum.totalAmount || 0,
        totalProducts: totalProducts || 0,
        pendingOrders: pendingOrders || 0,
        activePharmacies: activePharmacies?.length || 0,
        monthlyGrowth: 12, // TODO: Calculate actual growth
      },
      recentOrders: recentOrders || [],
      topProducts: topProductsWithDetails || [],
      pharmacyRequests: (pharmacyRequests || []).map((request: any) => ({
        id: request.id,
        pharmacy: request.pharmacy,
        productName: request.items[0]?.productName || "Multiple Products",
        quantity: request.items.reduce((sum: number, item: any) => sum + item.quantity, 0),
        maxBudget: request.totalAmount,
        urgency: "High", // You can add urgency logic based on quote expiry
        orderNumber: request.orderNumber,
        quoteNumber: request.quoteNumber,
        quoteExpiryDate: request.quoteExpiryDate,
        itemCount: request.items.length,
        createdAt: request.createdAt,
        items: request.items.map((item: any) => ({
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        }))
      })),
      expiringBatches: (expiringBatches || []).map(batch => ({
        id: batch.id,
        productName: batch.name,
        batchNumber: batch.batchNumber || "N/A",
        quantity: batch.stock,
        expiryDate: batch.expiryDate,
        daysToExpiry: Math.ceil((batch.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      })),
      monthlyRevenue: monthlyRevenueArray || [],
      wholesaler: {
        ...wholesaler,
        verificationStatus: wholesaler.isVerified ? "VERIFIED" : "PENDING",
        profileImage: wholesaler.user?.userProfile?.profileImage,
        countryOfOrigin: (countryOrigins || []).map(c => c.countryOfOrigin),
        specializations: (() => {
          try {
            if (wholesaler.specialties && typeof wholesaler.specialties === 'string') {
              return JSON.parse(wholesaler.specialties)
            } else if (Array.isArray(wholesaler.specialties)) {
              return wholesaler.specialties
            }
            return []
          } catch (error) {
            console.error("Error parsing specialties:", error)
            return []
          }
        })(),
      },
    })
  } catch (error) {
    console.error("Wholesaler dashboard fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
