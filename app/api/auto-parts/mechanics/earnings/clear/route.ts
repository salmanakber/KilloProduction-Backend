import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

/**
 * POST /api/auto-parts/mechanics/earnings/clear
 * Clear pending earnings for a specific service request (add to wallet)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "MECHANIC") {
      return NextResponse.json({ error: "Unauthorized - Mechanic access only" }, { status: 401 })
    }

    const body = await request.json()
    const { serviceRequestId } = body

    if (!serviceRequestId) {
      return NextResponse.json({ error: "Service request ID is required" }, { status: 400 })
    }

    // Get mechanic profile
    const mechanicProfile = await prisma.mechanicProfile.findUnique({
      where: { userId: user.id },
    })

    if (!mechanicProfile) {
      return NextResponse.json({ error: "Mechanic profile not found" }, { status: 404 })
    }

    // Get service request
    const serviceRequest = await prisma.mechanicServiceRequest.findUnique({
      where: {
        id: serviceRequestId,
        mechanicId: mechanicProfile.id,
        status: "COMPLETED",
      },
      include: {
        customer: {
          select: {
            name: true,
          },
        },
        quote: {
          select: {
            serviceCharges: true,
            totalAmount: true,
          },
        },
      },
    })

    if (!serviceRequest) {
      return NextResponse.json(
        { error: "Service request not found or not completed" },
        { status: 404 }
      )
    }

    // Check if payment is PAID
    const payment = await prisma.payment.findFirst({
      where: {
        orderId: serviceRequestId,
        status: "PAID",
      },
    })

    if (!payment) {
      return NextResponse.json(
        { error: "Payment not found or not paid. Cannot clear earnings." },
        { status: 400 }
      )
    }

    // Check if already cleared - search in all wallet transactions
    const allWalletTransactions = await prisma.walletTransaction.findMany({
      where: {
        userId: user.id,
        type: "CREDIT",
      },
    })

    const existingTransaction = allWalletTransactions.find((wt) => {
      if (wt.metadata && typeof wt.metadata === "object") {
        const meta = wt.metadata as any
        return meta.serviceRequestId === serviceRequestId
      }
      return false
    })

    if (existingTransaction) {
      return NextResponse.json(
        { error: "Earnings for this job have already been cleared" },
        { status: 400 }
      )
    }

    // Calculate mechanic earnings
    const metadata = (serviceRequest.metadata as any) || {}
    let mechanicEarnings = 0

    if (serviceRequest.quote) {
      const serviceCharges = serviceRequest.quote.serviceCharges || metadata.quoteServiceCharges || 0
      const mechanicTax = metadata.mechanicTax || 0
      const mechanicCommission = metadata.mechanicCommission || 0
      // If tax/commission not in metadata, calculate from rates
      if (mechanicTax === 0 && metadata.mechanicTaxRate) {
        const calculatedTax = (serviceCharges * metadata.mechanicTaxRate) / 100
        mechanicEarnings = serviceCharges - calculatedTax - (metadata.mechanicCommission || 0)
      } else {
        mechanicEarnings = serviceCharges - mechanicTax - mechanicCommission
      }
    } else if (metadata.mechanicCommission !== undefined && metadata.mechanicCommission !== null) {
      // From offer metadata: use stored mechanicCommission (already net of tax)
      mechanicEarnings = metadata.mechanicCommission || 0
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

    if (mechanicEarnings <= 0) {
      return NextResponse.json(
        { error: "No earnings to clear for this service request" },
        { status: 400 }
      )
    }

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Get or create wallet
      let wallet = await tx.wallet.findUnique({
        where: { userId: user.id },
      })

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            userId: user.id,
            balance: 0,
            currency: "NGN",
          },
        })
      }

      // Update wallet balance
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: {
            increment: mechanicEarnings,
          },
        },
      })

      // Create wallet transaction
      const walletTransaction = await tx.walletTransaction.create({
        data: {
          userId: user.id,
          type: "CREDIT",
          amount: mechanicEarnings,
          balance: updatedWallet.balance,
          description: `Earnings from completed service request #${serviceRequestId}`,
          reference: `MECH-EARN-${serviceRequestId}`,
          status: "COMPLETED",
          metadata: {
            serviceRequestId: serviceRequestId,
            mechanicId: mechanicProfile.id,
            customerName: serviceRequest.customer.name,
            vehicleMake: serviceRequest.vehicleMake,
            vehicleModel: serviceRequest.vehicleModel,
            earnings: mechanicEarnings,
            clearedAt: new Date().toISOString(),
          },
        },
      })

      // Create transaction record
      await tx.transaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          orderId: serviceRequestId,
          type: "CREDIT",
          amount: mechanicEarnings,
          currency: wallet.currency,
          status: "COMPLETED",
          description: `Mechanic earnings cleared for service request #${serviceRequestId}`,
          reference: `MECH-EARN-${serviceRequestId}`,
          metadata: {
            serviceRequestId: serviceRequestId,
            mechanicId: mechanicProfile.id,
          },
        },
      })

      return {
        wallet: updatedWallet,
        walletTransaction,
      }
    })

    return NextResponse.json({
      success: true,
      message: "Earnings cleared successfully",
      data: {
        earnings: Math.round(mechanicEarnings * 100) / 100,
        newBalance: Math.round(result.wallet.balance * 100) / 100,
        currency: result.wallet.currency,
      },
    })
  } catch (error: any) {
    console.error("Clear earnings error:", error)
    return NextResponse.json(
      { error: "Failed to clear earnings", details: error.message },
      { status: 500 }
    )
  }
}



