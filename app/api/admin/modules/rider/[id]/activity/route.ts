import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const riderId = params.id

    // Fetch rider profile to get modules
    const riderProfile = await prisma.riderProfile.findFirst({
      where: {
        userId: riderId,
      },
      select: {
        modules: true,
      },
    })

    // Fetch ride booking analytics
    const rideBookings = await prisma.rideBooking.findMany({
      where: {
        riderId: riderId,
      },
      select: {
        status: true,
        estimatedFare: true,
        finalFare: true,
        customerRating: true,
      },
    })

    const rideBookingsStats = {
      total: rideBookings.length,
      completed: rideBookings.filter(rb => rb.status === "COMPLETED").length,
      cancelled: rideBookings.filter(rb => rb.status === "CANCELLED").length,
      earnings: rideBookings
        .filter(rb => rb.status === "COMPLETED")
        .reduce((sum, rb) => sum + (rb.finalFare || rb.estimatedFare || 0), 0),
      averageRating: rideBookings
        .filter(rb => rb.customerRating !== null)
        .reduce((sum, rb) => sum + (rb.customerRating || 0), 0) / 
        Math.max(rideBookings.filter(rb => rb.customerRating !== null).length, 1),
    }

    // Fetch courier booking analytics
    const courierBookings = await prisma.courierBooking.findMany({
      where: {
        riderId: riderId,
      },
      select: {
        status: true,
        fare: true,
      },
    })

    const courierBookingsStats = {
      total: courierBookings.length,
      completed: courierBookings.filter(cb => cb.status === "DELIVERED").length,
      cancelled: courierBookings.filter(cb => cb.status === "CANCELLED").length,
      earnings: courierBookings
        .filter(cb => cb.status === "DELIVERED")
        .reduce((sum, cb) => sum + (cb.fare || 0), 0),
    }

    // Fetch wallet analytics
    const wallet = await prisma.wallet.findFirst({
      where: {
        userId: riderId,
      },
      select: {
        balance: true,
      },
    })

    const walletTransactions = await prisma.transaction.findMany({
      where: {
        userId: riderId,
      },
      select: {
        type: true,
        amount: true,
        status: true,
      },
    })

    const walletStats = {
      balance: wallet?.balance || 0,
      totalTransactions: walletTransactions.length,
      totalDeposits: walletTransactions
        .filter(t => t.type === "DEPOSIT" && t.status === "COMPLETED")
        .reduce((sum, t) => sum + t.amount, 0),
      totalWithdrawals: walletTransactions
        .filter(t => t.type === "WITHDRAWAL" && t.status === "COMPLETED")
        .reduce((sum, t) => sum + t.amount, 0),
    }

    // Calculate module activity based on rider's modules
    const modules = riderProfile?.modules as string[] || []
    const moduleActivity = await Promise.all(
      modules.map(async (moduleName) => {
        let activityCount = 0
        let earnings = 0

        switch (moduleName) {
          case "RIDING":
            activityCount = rideBookings.length
            earnings = rideBookingsStats.earnings
            break
          case "COURIER":
            activityCount = courierBookings.length
            earnings = courierBookingsStats.earnings
            break
          case "PHARMACY":
            // Count pharmacy-related orders
            const pharmacyOrders = await prisma.order.count({
              where: {
                riderId: riderId,
                module: "PHARMACY",
              },
            })
            activityCount = pharmacyOrders
            // You might need to add earnings calculation for pharmacy orders
            break
          case "FOOD":
            // Count food-related orders
            const foodOrders = await prisma.order.count({
              where: {
                riderId: riderId,
                module: "FOOD",
              },
            })
            activityCount = foodOrders
            break
          case "GROCERY":
            // Count grocery-related orders
            const groceryOrders = await prisma.order.count({
              where: {
                riderId: riderId,
                module: "GROCERY",
              },
            })
            activityCount = groceryOrders
            break
          case "AUTO_PARTS":
            // Count auto parts-related orders
            const autoPartsOrders = await prisma.order.count({
              where: {
                riderId: riderId,
                module: "AUTO_PARTS",
              },
            })
            activityCount = autoPartsOrders
            break
          case "WHOLESALER":
            // Count wholesaler-related orders
            const wholesalerOrders = await prisma.order.count({
              where: {
                riderId: riderId,
                module: "WHOLESALER",
              },
            })
            activityCount = wholesalerOrders
            break
        }

        return {
          name: moduleName,
          activityCount,
          earnings,
        }
      })
    )

    return NextResponse.json({
      success: true,
      rideBookings: rideBookingsStats,
      courierBookings: courierBookingsStats,
      wallet: walletStats,
      modules: moduleActivity,
    })
  } catch (error) {
    console.error("Error fetching rider activity:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch rider activity",
      },
      { status: 500 }
    )
  }
}
