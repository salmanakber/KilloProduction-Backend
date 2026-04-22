import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getVendorMerchandiseCredits } from "@/lib/vendor-wallet-revenue"
import { platformFundedDeltaForOrder } from "@/lib/order-special-offer-pricing"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const store = await prisma.autoPartsStore.findUnique({
      where: { userId: user.id },
    })

    if (!store) {
      return NextResponse.json({ error: "Auto parts store not found" }, { status: 404 })
    }

    // Get dashboard analytics
    const [
      totalOrders,
      totalProducts,
      pendingOrders,
      recentOrders,
      topProducts,
      monthlyRevenue,
      partRequests,
    ] = await Promise.all([
      // Total orders
      prisma.order.count({
        where: {
          vendorId: user.id,
          module: "AUTO_PARTS",
        },
      }),

      // Total products
      prisma.autoPart.count({
        where: { storeId: store.id },
      }),

      // Pending orders
      prisma.order.count({
        where: {
          vendorId: user.id,
          module: "AUTO_PARTS",
          status: { in: ["PENDING", "CONFIRMED"] },
        },
      }),

      // Recent orders
      prisma.order.findMany({
        where: {
          vendorId: user.id,
          module: "AUTO_PARTS",
        },
        include: {
          customer: {
            select: { name: true, phone: true },
          },
          orderItems: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),

      // Top selling products
      prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          order: {
            vendorId: user.id,
            module: "AUTO_PARTS",
            status: "DELIVERED",
          },
        },
        _sum: { quantity: true },
        _count: { productId: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),

      // Monthly revenue (last 12 months)
      prisma.$queryRaw`
        SELECT 
          DATE_FORMAT(createdAt, '%Y-%m') as month,
          SUM(total) as revenue,
          COUNT(*) as orders
        FROM orders 
        WHERE vendorId = ${user.id} 
          AND module = 'AUTO_PARTS'
          AND status = 'DELIVERED'
          AND createdAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
        ORDER BY month DESC
      `,

      // Part requests matching store products
      prisma.partRequest.findMany({
        where: {
          status: "OPEN",
          OR: [
            {
              partType: {
                in: await prisma.autoPart
                  .findMany({
                    where: { storeId: store.id },
                    select: { partType: true },
                    distinct: ["partType"],
                  })
                  .then((parts) => parts.map((p) => p.partType)),
              },
            },
          ],
        },
        include: {
          user: {
            select: { name: true, phone: true },
          },
          offers: {
            where: { vendorId: user.id },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ])

    const { txs: walletTxs } = await getVendorMerchandiseCredits({
      vendorUserId: user.id,
      module: "AUTO_PARTS",
    })
    const walletTotalRevenue = walletTxs.reduce((s, t) => s + Number(t.amount || 0), 0)

    // Get product details for top products
    const topProductsWithDetails = await Promise.all(
      topProducts.map(async (item) => {
        const product = await prisma.autoPart.findUnique({
          where: { id: item.productId },
          select: { name: true, price: true, images: true },
        })
        return {
          ...product,
          totalSold: item._sum.quantity,
          orderCount: item._count.productId,
        }
      }),
    )

    const adjustedRecentOrders = recentOrders.map((o: any) => {
      const platformDelta = platformFundedDeltaForOrder(o.metadata, "AUTO_PARTS")
      return {
        ...o,
        total: Number(o.total || 0) + platformDelta,
      }
    })

    return NextResponse.json({
      analytics: {
        totalOrders,
        totalRevenue: walletTotalRevenue,
        totalProducts,
        pendingOrders,
      },
      recentOrders: adjustedRecentOrders,
      topProducts: topProductsWithDetails,
      monthlyRevenue,
      partRequests,
      store: {
        ...store,
        verificationStatus: store.isVerified ? "VERIFIED" : "PENDING",
      },
    })
  } catch (error) {
    console.error("Dashboard fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
