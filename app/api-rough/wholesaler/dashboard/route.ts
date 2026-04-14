import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
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

        // Monthly revenue
        prisma.$queryRaw`
          SELECT 
            DATE_FORMAT(createdAt, '%Y-%m') as month,
            SUM(totalAmount) as revenue,
            COUNT(*) as orders
          FROM supplier_orders 
          WHERE wholesalerId = ${wholesaler.id} 
            AND status = 'DELIVERED'
            AND createdAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
          GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
          ORDER BY month DESC
        `,
      ])

    // Get product details for top products
    const topProductsWithDetails = await Promise.all(
      topProducts.map(async (item) => {
        const product = await prisma.wholesalerProduct.findUnique({
          where: { id: item.productId },
          select: { name: true, unitPrice: true, countryOfOrigin: true },
        })
        return {
          ...product,
          totalSold: item._sum.quantity,
          orderCount: item._count.productId,
        }
      }),
    )

    return NextResponse.json({
      analytics: {
        totalOrders,
        totalRevenue: totalRevenue._sum.totalAmount || 0,
        totalProducts,
        pendingOrders,
      },
      recentOrders,
      topProducts: topProductsWithDetails,
      monthlyRevenue,
      wholesaler: {
        ...wholesaler,
        verificationStatus: wholesaler.isVerified ? "VERIFIED" : "PENDING",
      },
    })
  } catch (error) {
    console.error("Wholesaler dashboard fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
