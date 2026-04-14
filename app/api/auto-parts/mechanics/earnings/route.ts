import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

/**
 * GET /api/auto-parts/mechanics/earnings
 * Calculate mechanic earnings breakdown:
 * - Pending money: Completed jobs with PAID payment but earnings not yet cleared to wallet
 * - Available to withdraw: Earnings already in wallet (from wallet transactions)
 * - Can be cleared: Completed jobs that can be marked as cleared (payment verified, job completed)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "MECHANIC") {
      return NextResponse.json({ error: "Unauthorized - Mechanic access only" }, { status: 401 })
    }

    // Get mechanic profile
    const mechanicProfile = await prisma.mechanicProfile.findUnique({
      where: { userId: user.id },
    })

    if (!mechanicProfile) {
      return NextResponse.json({ error: "Mechanic profile not found" }, { status: 404 })
    }

    // Get all completed service requests for this mechanic
    const completedServiceRequests = await prisma.mechanicServiceRequest.findMany({
      where: {
        mechanicId: mechanicProfile.id,
        status: "COMPLETED",
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        quote: {
          select: {
            id: true,
            serviceCharges: true,
            totalAmount: true,
            partsList: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    const wallet = await prisma.wallet.findUnique({
      where: { userId: user.id },
    })

    // Load mechanic-related credits even if wallet row was missing historically (tx still keyed by userId)
    const walletTransactions = await prisma.walletTransaction.findMany({
      where: {
        userId: user.id,
        type: "CREDIT",
        status: {
          in: ["PENDING", "COMPLETED"],
        },
        OR: [
          { reference: { startsWith: "MECHANIC-EARN-" } },
          { description: { contains: "Mechanic", mode: "insensitive" } },
          { description: { contains: "mechanic", mode: "insensitive" } },
          { metadata: { path: ["module"], equals: "AUTO_PARTS" } },
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    // Get payments related to service requests
    const serviceRequestIds = completedServiceRequests.map((sr) => sr.id)
    const payments = await prisma.payment.findMany({
      where: {
        orderId: {
          in: serviceRequestIds,
        },
        status: "PAID",
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    // Create a map of service request ID to payment
    const paymentMap = new Map(payments.map((p) => [p.orderId, p]))

    // Calculate earnings breakdown from wallet transactions
    // PENDING transactions = pending money (waiting for customer approval)
    // COMPLETED transactions = available money (already in wallet)
    let pendingMoney = 0
    let availableToWithdraw = 0

    const pendingJobs: any[] = []
    const clearedJobs: any[] = []

    // Calculate pending from PENDING wallet transactions
    const pendingTransactions = walletTransactions.filter((wt) => wt.status === "PENDING")
    pendingMoney = pendingTransactions.reduce((sum, wt) => sum + wt.amount, 0)

    // Calculate available from COMPLETED wallet transactions (already in wallet balance)
    const completedTransactions = walletTransactions.filter((wt) => wt.status === "COMPLETED")
    availableToWithdraw = wallet?.balance || 0 // Wallet balance contains all completed transactions

    // Also calculate from completed service requests for job listings
    for (const serviceRequest of completedServiceRequests) {
      const metadata = (serviceRequest.metadata as any) || {}
      const payment = paymentMap.get(serviceRequest.id)

      // Find wallet transaction for this service request
      const walletTransaction = walletTransactions.find(
        (wt) =>
          wt.metadata &&
          typeof wt.metadata === "object" &&
          "serviceRequestId" in wt.metadata &&
          (wt.metadata as any).serviceRequestId === serviceRequest.id
      )

      // Calculate mechanic earnings from wallet transaction or service request
      let mechanicEarnings = 0
      if (walletTransaction) {
        mechanicEarnings = walletTransaction.amount
      } else {
        // Fallback: calculate from service request metadata
        if (serviceRequest.quote) {
          const serviceCharges = serviceRequest.quote.serviceCharges || metadata.quoteServiceCharges || 0
          const mechanicTax = metadata.mechanicTax || 0
          const mechanicCommission = metadata.mechanicCommission || 0
          if (mechanicTax === 0 && metadata.mechanicTaxRate) {
            const calculatedTax = (serviceCharges * metadata.mechanicTaxRate) / 100
            mechanicEarnings = serviceCharges - calculatedTax - (metadata.mechanicCommission || 0)
          } else {
            mechanicEarnings = serviceCharges - mechanicTax - mechanicCommission
          }
        } else if (metadata.mechanicEarnings !== undefined) {
          mechanicEarnings = metadata.mechanicEarnings || 0
        } else if (metadata.serviceCharges) {
          const serviceCharges = metadata.serviceCharges || 0
          const mechanicTax = metadata.mechanicTax || 0
          const mechanicCommission = metadata.mechanicCommission || 0
          if (mechanicTax === 0 && metadata.mechanicTaxRate) {
            const calculatedTax = (serviceCharges * metadata.mechanicTaxRate) / 100
            const calculatedCommission = metadata.mechanicCommissionRate
              ? (serviceCharges * metadata.mechanicCommissionRate) / 100
              : 0
            mechanicEarnings = serviceCharges - calculatedTax - calculatedCommission
          } else {
            mechanicEarnings = serviceCharges - mechanicTax - mechanicCommission
          }
        }
      }

      // Check if payment exists and is PAID
      const isPaid = payment?.status === "PAID"

      const jobData = {
        id: serviceRequest.id,
        customerName: serviceRequest.customer.name,
        customerPhone: serviceRequest.customer.phone,
        vehicleMake: serviceRequest.vehicleMake,
        vehicleModel: serviceRequest.vehicleModel,
        completedAt: serviceRequest.updatedAt,
        earnings: mechanicEarnings,
        paymentStatus: isPaid ? "PAID" : "PENDING",
        isCleared: walletTransaction?.status === "COMPLETED",
      }

      if (walletTransaction?.status === "PENDING") {
        // Pending: waiting for customer approval
        pendingJobs.push(jobData)
      } else if (walletTransaction?.status === "COMPLETED") {
        // Cleared: customer approved, money in wallet
        clearedJobs.push(jobData)
      } else if (isPaid && serviceRequest.status === "COMPLETED") {
        // Completed job with payment but no wallet transaction yet (shouldn't happen, but handle it)
        pendingJobs.push(jobData)
      }
    }

    // Calculate total earnings from COMPLETED wallet transactions
    const totalEarnedFromWallet = completedTransactions.reduce((sum, wt) => {
      if (wt.type === "CREDIT" && wt.status === "COMPLETED") {
        return sum + wt.amount
      }
      return sum
    }, 0)

    // Total pending = sum of all PENDING wallet transactions
    const totalPending = pendingMoney

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          pendingMoney: Math.round(pendingMoney * 100) / 100,
          availableToWithdraw: Math.round(availableToWithdraw * 100) / 100,
          totalPending: Math.round(totalPending * 100) / 100,
          totalEarned: Math.round(totalEarnedFromWallet * 100) / 100,
          walletBalance: Math.round((wallet?.balance || 0) * 100) / 100,
          currency: wallet?.currency || "NGN",
        },
        pendingJobs: pendingJobs.map((job) => ({
          ...job,
          earnings: Math.round(job.earnings * 100) / 100,
        })),
        clearedJobs: clearedJobs.map((job) => ({
          ...job,
          earnings: Math.round(job.earnings * 100) / 100,
        })),
        wallet: wallet
          ? {
              id: wallet.id,
              balance: Math.round(wallet.balance * 100) / 100,
              currency: wallet.currency,
            }
          : null,
      },
    })
  } catch (error: any) {
    console.error("Mechanic earnings calculation error:", error)
    return NextResponse.json(
      { error: "Failed to calculate earnings", details: error.message },
      { status: 500 }
    )
  }
}


