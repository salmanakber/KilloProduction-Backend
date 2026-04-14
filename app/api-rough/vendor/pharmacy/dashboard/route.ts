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

    // Get dashboard analytics
    const [
      totalOrders,
      totalRevenue,
      totalMedicines,
      pendingOrders,
      lowStockMedicines,
      recentOrders,
      topMedicines,
      prescriptionRequests,
      monthlyRevenue,
      urgentStockAlerts,
    ] = await Promise.all([
      // Total orders
      prisma.order.count({
        where: {
          vendorId: user.id,
          module: "PHARMACY",
        },
      }),

      // Total revenue
      prisma.order.aggregate({
        where: {
          vendorId: user.id,
          module: "PHARMACY",
          status: "DELIVERED",
        },
        _sum: { total: true },
      }),

      // Total medicines
      prisma.medicine.count({
        where: { pharmacyId: pharmacy.id },
      }),

      // Pending orders
      prisma.order.count({
        where: {
          vendorId: user.id,
          module: "PHARMACY",
          status: { in: ["PENDING", "CONFIRMED"] },
        },
      }),

      // Low stock medicines
      prisma.medicine.count({
        where: {
          pharmacyId: pharmacy.id,
          stock: { lte: 10 },
          isActive: true,
        },
      }),

      // Recent orders
      prisma.order.findMany({
        where: {
          vendorId: user.id,
          module: "PHARMACY",
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

      // Top selling medicines
      prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          order: {
            vendorId: user.id,
            module: "PHARMACY",
            status: "DELIVERED",
          },
        },
        _sum: { quantity: true },
        _count: { productId: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),

      // Prescription requests
      prisma.prescription.count({
        where: {
          status: { in: ["UPLOADED", "UNDER_REVIEW"] },
        },
      }),

      // Monthly revenue
      prisma.$queryRaw`
        SELECT 
          DATE_FORMAT(createdAt, '%Y-%m') as month,
          SUM(total) as revenue,
          COUNT(*) as orders
        FROM orders 
        WHERE vendorId = ${user.id} 
          AND module = 'PHARMACY'
          AND status = 'DELIVERED'
          AND createdAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
        ORDER BY month DESC
      `,

      // Urgent stock alerts (expiring soon or very low stock)
      prisma.medicine.findMany({
        where: {
          pharmacyId: pharmacy.id,
          isActive: true,
          OR: [
            { stock: { lte: 5 } },
            {
              expiryDate: {
                lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          stock: true,
          expiryDate: true,
          minStock: true,
        },
        orderBy: { stock: "asc" },
        take: 10,
      }),
    ])

    // Get medicine details for top medicines
    const topMedicinesWithDetails = await Promise.all(
      topMedicines.map(async (item) => {
        const medicine = await prisma.medicine.findUnique({
          where: { id: item.productId },
          select: { name: true, price: true, images: true, form: true },
        })
        return {
          ...medicine,
          totalSold: item._sum.quantity,
          orderCount: item._count.productId,
        }
      }),
    )

    return NextResponse.json({
      analytics: {
        totalOrders,
        totalRevenue: totalRevenue._sum.total || 0,
        totalMedicines,
        pendingOrders,
        lowStockMedicines,
        prescriptionRequests,
      },
      recentOrders,
      topMedicines: topMedicinesWithDetails,
      monthlyRevenue,
      urgentStockAlerts,
      pharmacy: {
        ...pharmacy,
        verificationStatus: pharmacy.isVerified ? "VERIFIED" : "PENDING",
      },
    })
  } catch (error) {
    console.error("Pharmacy dashboard fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
