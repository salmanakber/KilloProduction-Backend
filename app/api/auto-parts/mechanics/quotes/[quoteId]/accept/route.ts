import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"
import { emitAutoPartsQuoteSocket } from "@/lib/auto-parts-realtime"

// POST - Customer accepts a quote (creates service request)
export async function POST(
  request: NextRequest,
  { params }: { params: { quoteId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized - Customer access only" }, { status: 401 })
    }

    const { quoteId } = params
    const body = await request.json()
    const { paymentMethod, paymentData } = body || {}

    // Get quote
    const quote = await (prisma as any).mechanicQuote.findUnique({
      where: { id: quoteId },
      include: {
        mechanic: {
          include: {
            mechanicProfile: true,
          },
        },
      },
    })

    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    }

    if (quote.customerId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    if (quote.status !== "PENDING" && quote.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: `Cannot accept quote with status ${quote.status}. Quote must be PENDING or SUBMITTED.` },
        { status: 400 }
      )
    }

    // Ensure quote has pricing
    if (!quote.serviceCharges || !quote.totalAmount) {
      return NextResponse.json(
        { error: "Quote pricing is not yet available. Please wait for the mechanic to submit the quote." },
        { status: 400 }
      )
    }

    // Check if mechanic profile exists
    if (!quote.mechanic.mechanicProfile) {
      return NextResponse.json({ error: "Mechanic profile not found" }, { status: 400 })
    }

    // Get system settings and commission settings for tax calculation
    const settings = await prisma.systemSettings.findFirst({
      orderBy: { createdAt: 'desc' }
    })

    // Get tax + commission settings (aligned with mechanic offer accept)
    const [customerTaxSetting, mechanicTaxSetting, platformFeeSetting, mechanicCommissionSetting] =
      await Promise.all([
        prisma.commissionSetting.findUnique({
          where: {
            module_commissionType: {
              module: "AUTO_PARTS",
              commissionType: "CUSTOMER_TAX" as any,
            },
          },
        }),
        prisma.commissionSetting.findUnique({
          where: {
            module_commissionType: {
              module: "AUTO_PARTS",
              commissionType: "MECHANIC_TAX" as any,
            },
          },
        }),
        prisma.commissionSetting.findUnique({
          where: {
            module_commissionType: {
              module: "AUTO_PARTS",
              commissionType: "PLATFORM_FEE",
            },
          },
        }),
        prisma.commissionSetting.findUnique({
          where: {
            module_commissionType: {
              module: "AUTO_PARTS",
              commissionType: "MECHANIC_COMMISSION" as any,
            },
          },
        }),
      ])

    // Calculate taxes & fees
    const customerTaxRate = customerTaxSetting?.rate || 0
    const mechanicTaxRate = mechanicTaxSetting?.rate || 0
    const subtotal = quote.totalAmount || 0
    const customerTax = (subtotal * customerTaxRate) / 100

    /** Platform fee is paid by the customer (added to checkout), not deducted from mechanic escrow. */
    let platformFee = platformFeeSetting?.rate ? (subtotal * platformFeeSetting.rate) / 100 : 0
    if (platformFeeSetting?.minAmount && platformFee < platformFeeSetting.minAmount) {
      platformFee = platformFeeSetting.minAmount
    }
    if (platformFeeSetting?.maxAmount && platformFee > platformFeeSetting.maxAmount) {
      platformFee = platformFeeSetting.maxAmount
    }
    platformFee = Math.round(platformFee * 100) / 100

    const totalAmount = subtotal + customerTax + platformFee

    /** Full quote total attributed to the job for mechanic commission (before mechanic tax). */
    const mechanicGrossForPayout = subtotal

    /** MECHANIC_TAX applies only to labor + diagnostic (mechanic’s work), not the full quote subtotal. */
    const mechanicTaxBase = (quote.serviceCharges || 0) + (quote.diagnosticFee || 0)
    const mechanicTax = (mechanicTaxBase * mechanicTaxRate) / 100

    let mechanicCommission = mechanicCommissionSetting?.rate
      ? (mechanicGrossForPayout * mechanicCommissionSetting.rate) / 100
      : 0
    if (mechanicCommissionSetting?.minAmount && mechanicCommission < mechanicCommissionSetting.minAmount) {
      mechanicCommission = mechanicCommissionSetting.minAmount
    }
    if (mechanicCommissionSetting?.maxAmount && mechanicCommission > mechanicCommissionSetting.maxAmount) {
      mechanicCommission = mechanicCommissionSetting.maxAmount
    }
    mechanicCommission = Math.round(mechanicCommission * 100) / 100

    /** Escrow: quote total minus mechanic tax (on labor/diagnostic) and platform mechanic commission — platform fee is not taken from mechanic. */
    const mechanicEarnings = Math.max(
      0,
      Math.round((mechanicGrossForPayout - mechanicTax - mechanicCommission) * 100) / 100
    )

    const quotePaymentBreakdown = {
      currency: settings?.defaultCurrency || "NGN",
      subtotal,
      customerTax,
      customerTaxRate,
      mechanicGrossForPayout,
      mechanicTaxBase,
      platformFee,
      platformFeeRate: platformFeeSetting?.rate ?? 0,
      platformFeePaidBy: "CUSTOMER" as const,
      mechanicTax,
      mechanicTaxRate,
      mechanicCommission,
      mechanicCommissionRate: mechanicCommissionSetting?.rate ?? 0,
      mechanicEarnings,
      totalChargedToCustomer: totalAmount,
      quoteId: quote.id,
      source: "MECHANIC_QUOTE_ACCEPT",
    }

    const payOk =
      paymentData?.status === "succeeded" ||
      paymentData?.status === "SUCCEEDED" ||
      paymentData?.status === "PAID" ||
      paymentData?.status === "COMPLETED"

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
        // Create service request from accepted quote
      const serviceRequest = await tx.mechanicServiceRequest.create({
        data: {
          customerId: user.id,
          mechanicId: quote.mechanic.mechanicProfile.id, // Use MechanicProfile.id
          vehicleMake: quote.vehicleMake,
          vehicleModel: quote.vehicleModel,
          vehicleYear: quote.vehicleYear || null,
          issueDescription: quote.issueDescription,
          diagnosedIssues: {}, // Required field - empty object for quotes
          recommendedParts: quote.partsList || [], // Use parts list from quote if available
          customerLatitude: quote.customerLatitude,
          customerLongitude: quote.customerLongitude,
          customerAddress: quote.customerAddress,
          customerCity: quote.customerCity,
          urgency: quote.urgency,
          // @ts-ignore
          type: "ONLY_SERVICE",
          status: "ACCEPTED", // Directly accepted since quote was already accepted
          metadata: {
            quoteId: quote.id,
            quoteTotalAmount: quote.totalAmount,
            quoteServiceCharges: quote.serviceCharges,
            quotePartsList: quote.partsList,
            customerTax: customerTax,
            customerTaxRate: customerTaxRate,
            mechanicTax,
            mechanicTaxRate,
            mechanicTaxBase,
            quotePaymentBreakdown,
          } as any,
        },
        include: {
          customer: {
            select: {
              name: true,
              phone: true,
            },
          },
          mechanic: {
            select: {
              businessName: true,
              logo: true,
            },
          },
        },
      })

      // Update quote status and link to service request
      await (tx as any).mechanicQuote.update({
        where: { id: quoteId },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          serviceRequestId: serviceRequest.id,
        },
      })

      // Create payment record if payment data provided
      let paymentRecord: any = null
      if (paymentData) {
        paymentRecord = await tx.payment.create({
          data: {
            userId: user.id,
            amount: totalAmount,
            currency: settings?.defaultCurrency || "NGN",
            status: paymentData.status === 'succeeded' ? 'PAID' : 'PENDING',
            gateway: paymentData.gateway || 'STRIPE',
            gatewayTransactionId: paymentData.id || paymentData.transactionId || undefined,
            metadata: {
              quoteId: quote.id,
              serviceRequestId: serviceRequest.id,
              customerTax: customerTax,
              mechanicTax: mechanicTax,
              quotePaymentBreakdown,
              ...paymentData,
            } as any,
          },
        })
      }

      // If wallet payment, update wallet balance
      if (paymentMethod === 'wallet' && paymentData?.walletTransaction) {
        // Wallet transaction is already handled by the wallet withdrawal endpoint
        // Just verify it exists
      }

      /** Escrow: PENDING wallet credit + commission rows when payment succeeded (mirrors part+mechanic offer accept; no vendor on quote-only jobs). */
      if (payOk && mechanicEarnings > 0) {
        const mechanicUserId = quote.mechanicId

        let mechanicWallet = await tx.wallet.findUnique({
          where: { userId: mechanicUserId },
        })
        if (!mechanicWallet) {
          mechanicWallet = await tx.wallet.create({
            data: {
              userId: mechanicUserId,
              balance: 0,
              currency: settings?.defaultCurrency || "NGN",
            },
          })
        }
        const currentMechanicBalance = mechanicWallet.balance

        await tx.walletTransaction.create({
          data: {
            userId: mechanicUserId,
            type: "CREDIT",
            amount: mechanicEarnings,
            balance: currentMechanicBalance,
            description: `Mechanic earnings from accepted quote (${quote.vehicleMake} ${quote.vehicleModel})`,
            reference: `MECHANIC-EARN-QUOTE-${serviceRequest.id}`,
            orderId: null,
            status: "PENDING",
            metadata: {
              quoteId: quote.id,
              serviceRequestId: serviceRequest.id,
              module: "AUTO_PARTS",
              source: "MECHANIC_QUOTE_ACCEPT",
              mechanicEarnings,
              quotePaymentBreakdown,
            },
          },
        })

        if (mechanicCommission > 0) {
          await tx.vendorCommission.create({
            data: {
              vendorId: mechanicUserId,
              orderId: null,
              module: "AUTO_PARTS",
              commissionType: "MECHANIC_COMMISSION" as any,
              orderAmount: mechanicGrossForPayout,
              commissionRate: mechanicCommissionSetting?.rate ?? 0,
              commissionAmount: mechanicCommission,
              status: "PAID",
            },
          })
        }

        /** Platform fee is collected from the customer (totalAmount); do not book it against the mechanic as vendor. */

        if (mechanicTax > 0) {
          await tx.vendorCommission.create({
            data: {
              vendorId: mechanicUserId,
              orderId: null,
              module: "AUTO_PARTS",
              commissionType: "MECHANIC_TAX" as any,
              orderAmount: mechanicTaxBase,
              commissionRate: mechanicTaxRate,
              commissionAmount: mechanicTax,
              status: "PAID",
            },
          })
        }

        if (customerTax > 0) {
          await (tx as any).customerTax.create({
            data: {
              customerId: user.id,
              orderId: null,
              module: "AUTO_PARTS",
              orderAmount: subtotal,
              taxRate: customerTaxRate,
              taxAmount: customerTax,
              status: "PAID",
              paidAt: new Date(),
            },
          })
        }
      }

      return { serviceRequest, paymentRecord }
    })

    emitAutoPartsQuoteSocket(quote.mechanicId, {
      quoteId,
      status: "ACCEPTED",
      event: "quote_accepted",
      serviceRequestId: result.serviceRequest.id,
    })
    emitAutoPartsQuoteSocket(user.id, {
      quoteId,
      status: "ACCEPTED",
      event: "quote_accepted",
      serviceRequestId: result.serviceRequest.id,
    })

    // Notify mechanic
    await NotificationBridge.sendNotification({
      userId: quote.mechanicId,
      title: "Quote Accepted",
      message: `${user.name} has accepted your quote. Service request created.`,
      type: "QUOTE_ACCEPTED",
      module: "AUTO_PARTS",
      actionUrl: `/auto-parts/mechanics/service-requests/${result.serviceRequest.id}`,
      data: {
        actionType: "navigate",
        screen: "MechanicServiceRequestDetails",
        params: [
          { name: "serviceRequestId", value: result.serviceRequest.id },
          { name: "requestId", value: result.serviceRequest.id },
        ],
        quoteId: quote.id,
        serviceRequestId: result.serviceRequest.id,
        requestId: result.serviceRequest.id,
        customerId: user.id,
      },
    })

    return NextResponse.json({
      success: true,
      quote: {
        ...quote,
        status: "ACCEPTED",
        serviceRequestId: result.serviceRequest.id,
      },
      serviceRequest: result.serviceRequest,
      payment: result.paymentRecord,
      totalAmount,
      customerTax,
      platformFee,
      quotePaymentBreakdown,
    })
  } catch (error) {
    console.error("Accept quote error:", error)
    return NextResponse.json({ error: "Failed to accept quote" }, { status: 500 })
  }
}

