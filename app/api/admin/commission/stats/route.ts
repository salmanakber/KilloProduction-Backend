import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { CommissionType } from "@prisma/client"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get current month and previous month for growth calculation
    const now = new Date()
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    // Get total commission amounts
    const [vendorCommissions, riderCommissions, vendorByTypeStatus, riderByTypeStatus] = await Promise.all([
      prisma.vendorCommission.aggregate({
        _sum: {
          commissionAmount: true
        }
      }),
      prisma.riderCommission.aggregate({
        _sum: {
          commissionAmount: true
        }
      }),
      prisma.vendorCommission.groupBy({
        by: ["commissionType", "status"],
        _sum: { commissionAmount: true },
        _count: { id: true },
      }),
      prisma.riderCommission.groupBy({
        by: ["commissionType", "status"],
        _sum: { commissionAmount: true },
        _count: { id: true },
      }),
    ])

    const totalCommission = (vendorCommissions._sum.commissionAmount || 0) + (riderCommissions._sum.commissionAmount || 0)

    // Get pending commission amounts
    const [pendingVendorCommissions, pendingRiderCommissions] = await Promise.all([
      prisma.vendorCommission.aggregate({
        where: {
          status: 'PENDING'
        },
        _sum: {
          commissionAmount: true
        }
      }),
      prisma.riderCommission.aggregate({
        where: {
          status: 'PENDING'
        },
        _sum: {
          commissionAmount: true
        }
      })
    ])

    const pendingCommission = (pendingVendorCommissions._sum.commissionAmount || 0) + (pendingRiderCommissions._sum.commissionAmount || 0)

    // Get paid commission amounts
    const [paidVendorCommissions, paidRiderCommissions] = await Promise.all([
      prisma.vendorCommission.aggregate({
        where: {
          status: 'PAID'
        },
        _sum: {
          commissionAmount: true
        }
      }),
      prisma.riderCommission.aggregate({
        where: {
          status: 'PAID'
        },
        _sum: {
          commissionAmount: true
        }
      })
    ])

    const paidCommission = (paidVendorCommissions._sum.commissionAmount || 0) + (paidRiderCommissions._sum.commissionAmount || 0)

    // Calculate monthly growth
    const [currentMonthCommissions, previousMonthCommissions] = await Promise.all([
      prisma.vendorCommission.aggregate({
        where: {
          createdAt: {
            gte: currentMonth
          }
        },
        _sum: {
          commissionAmount: true
        }
      }),
      prisma.vendorCommission.aggregate({
        where: {
          createdAt: {
            gte: previousMonth,
            lt: currentMonth
          }
        },
        _sum: {
          commissionAmount: true
        }
      })
    ])

    const currentMonthTotal = currentMonthCommissions._sum.commissionAmount || 0
    const previousMonthTotal = previousMonthCommissions._sum.commissionAmount || 0
    
    let monthlyGrowth = 0
    if (previousMonthTotal > 0) {
      monthlyGrowth = ((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100
    }

    // Get top commission earners (vendors)
    const topVendorEarners = await prisma.vendorCommission.groupBy({
      by: ['vendorId'],
      where: {
        status: 'PAID'
      },
      _sum: {
        commissionAmount: true
      },
      _count: {
        orderId: true
      },
      orderBy: {
        _sum: {
          commissionAmount: 'desc'
        }
      },
      take: 5
    })

    // Get vendor names for top earners
    const topEarners = await Promise.all(
      topVendorEarners.map(async (earner) => {
        const vendor = await prisma.user.findUnique({
          where: { id: earner.vendorId },
          select: { name: true }
        })
        
        return {
          vendorId: earner.vendorId,
          vendorName: vendor?.name || 'Unknown Vendor',
          commission: earner._sum.commissionAmount || 0,
          orders: earner._count.orderId || 0
        }
      })
    )

    const round2 = (n: number) => Math.round(n * 100) / 100

    const vendorCommissionBreakdown = vendorByTypeStatus.map((row) => ({
      commissionType: row.commissionType,
      status: row.status,
      amount: round2(row._sum.commissionAmount || 0),
      count: row._count.id,
    }))

    const riderCommissionBreakdown = riderByTypeStatus.map((row) => ({
      commissionType: row.commissionType,
      status: row.status,
      amount: round2(row._sum.commissionAmount || 0),
      count: row._count.id,
    }))

    const stats = {
      totalCommission: round2(totalCommission),
      pendingCommission: round2(pendingCommission),
      paidCommission: round2(paidCommission),
      monthlyGrowth: Math.round(monthlyGrowth * 10) / 10,
      topEarners,
      /** Per-type + status (includes PLATFORM_FEE on VendorCommission for customer platform reporting). */
      vendorCommissionBreakdown,
      riderCommissionBreakdown,
    }

    return NextResponse.json({ stats })
  } catch (error) {
    console.error("Error fetching commission stats:", error)
    return NextResponse.json({ error: "Failed to fetch commission stats" }, { status: 500 })
  }
}

