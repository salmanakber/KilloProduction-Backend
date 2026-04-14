import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"
import { broadcastAutoPartsOrderEvent } from "@/lib/auto-parts-order-socket-broadcast"
import { getAutoPartsMechanicPickupPricePerKm } from "@/lib/auto-parts-mechanic-pickup-settings"

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export async function POST(
  request: NextRequest,
  { params }: { params: { offerId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    let finalPaymentMetaData; 
    const { offerId } = params
    const body = await request.json()
    const { 
      paymentMethod,
      paymentData,
      notes
    } = body

    // Get the mechanic offer with related data
    const mechanicOffer = await prisma.mechanicOffer.findUnique({
      where: { id: offerId },
      include: {
        serviceRequest: {
          include: {
            customer: true
          }
        },
        mechanic: {
          include: {
            mechanicProfile: true
          }
        }
      }
    }) as any

    if (!mechanicOffer) {
      return NextResponse.json({ error: "Mechanic offer not found" }, { status: 404 })
    }

    // Verify customer owns the service request
    if (mechanicOffer.serviceRequest.customerId !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    // Check if offer is still valid
    if (mechanicOffer.status !== "PENDING") {
      return NextResponse.json({ error: "Offer is no longer available" }, { status: 400 })
    }
    

    if (mechanicOffer.expiresAt && new Date() > mechanicOffer.expiresAt) {
      return NextResponse.json({ error: "Offer has expired" }, { status: 400 })
    }



    // Get the order from service request metadata
    const metadata = mechanicOffer.serviceRequest.metadata as any
    if (!metadata?.requestId || !metadata?.offerId) {
      return NextResponse.json({ error: "Part request or offer information not found in service request" }, { status: 400 })
    }

    // Get the order using partRequestId from the requestId in metadata
    const order = await prisma.order.findFirst({
      where: { partRequestId: metadata.requestId },
      orderBy: { createdAt: "desc" },
      include: {
        vendor: {
          include: {
            vendorProfile: {
              select: {
                businessName: true,
                latitude: true,
                longitude: true
              }
            }
          }
        },
        address: true,
        orderItems: {
          select: {
            productName: true,
          },
          take: 1,
        }
      }
    }) as any

    if (!order || !order.vendor) {
      return NextResponse.json({ error: "Order or vendor not found" }, { status: 404 })
    }

    const vendorOffer = await prisma.partOffer.findUnique({
      where: { id: metadata.offerId }
    })

    if (!vendorOffer) {
      return NextResponse.json({ error: "Vendor offer not found" }, { status: 404 })
    }

    // Get system settings
    const settings = await prisma.systemSettings.findFirst({
      orderBy: { createdAt: 'desc' }
    })

    // Get commission settings for AUTO_PARTS module
    const [platformFeeSetting, vendorCommissionSetting, mechanicCommissionSetting, mechanicTaxSetting] =
      await Promise.all([
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
              commissionType: "VENDOR_COMMISSION",
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
        prisma.commissionSetting.findUnique({
          where: {
            module_commissionType: {
              module: "AUTO_PARTS",
              commissionType: "MECHANIC_TAX" as any,
            },
          },
        }),
      ])

    // Calculate prices
    const vendorPartPrice = vendorOffer.price
    const mechanicServiceFee = mechanicOffer.serviceCharges
    const mechanicDiagnosticFee = mechanicOffer.diagnosticFee || 0
    const mechanicTotal = mechanicOffer.totalAmount

    // Calculate pickup fee (distance from vendor to customer)
    let pickupFee = 0
    if (metadata.pickupFee) {
      pickupFee = metadata.pickupFee
    } else if (order.vendor?.vendorProfile?.latitude && order.vendor?.vendorProfile?.longitude && order.address?.latitude && order.address?.longitude) {
      const distance = calculateDistance(
        order.vendor.vendorProfile.latitude,
        order.vendor.vendorProfile.longitude,
        order.address.latitude,
        order.address.longitude
      )
      const pricePerKm = await getAutoPartsMechanicPickupPricePerKm()
      pickupFee = distance * pricePerKm
    }

    // AUTO_PARTS: no customer tax — customer pays items + mechanic + pickup + platform fee only
    const customerTaxRate = 0
    const mechanicTaxRate = mechanicTaxSetting?.rate || 0

    const subtotal = vendorPartPrice + mechanicTotal + pickupFee
    const customerTax = 0

    /** Labor + diagnostics/fees + pickup attributed to mechanic for tax & platform mechanic commission */
    const mechanicGrossForPayout = mechanicTotal + pickupFee

    const mechanicTax = (mechanicGrossForPayout * mechanicTaxRate) / 100

    // Platform fee (PLATFORM_FEE) on subtotal (parts + mechanic + pickup)
    const platformFeeRate = platformFeeSetting?.rate || 0
    let platformFee = (subtotal * platformFeeRate) / 100
    
    // Apply min/max limits for platform fee
    if (platformFeeSetting?.minAmount && platformFee < platformFeeSetting.minAmount) {
      platformFee = platformFeeSetting.minAmount
    }
    if (platformFeeSetting?.maxAmount && platformFee > platformFeeSetting.maxAmount) {
      platformFee = platformFeeSetting.maxAmount
    }
    platformFee = Math.round(platformFee * 100) / 100

    const vendorCommissionRate = vendorCommissionSetting?.rate ?? 0
    let vendorCommission =
      vendorCommissionRate > 0 ? (vendorPartPrice * vendorCommissionRate) / 100 : 0
    if (vendorCommissionSetting?.minAmount && vendorCommission < vendorCommissionSetting.minAmount) {
      vendorCommission = vendorCommissionSetting.minAmount
    }
    if (vendorCommissionSetting?.maxAmount && vendorCommission > vendorCommissionSetting.maxAmount) {
      vendorCommission = vendorCommissionSetting.maxAmount
    }
    vendorCommission = Math.round(vendorCommission * 100) / 100

    const mechanicCommissionRate = mechanicCommissionSetting?.rate ?? 0
    let mechanicCommission =
      mechanicCommissionRate > 0 ? (mechanicGrossForPayout * mechanicCommissionRate) / 100 : 0
    if (mechanicCommissionSetting?.minAmount && mechanicCommission < mechanicCommissionSetting.minAmount) {
      mechanicCommission = mechanicCommissionSetting.minAmount
    }
    if (mechanicCommissionSetting?.maxAmount && mechanicCommission > mechanicCommissionSetting.maxAmount) {
      mechanicCommission = mechanicCommissionSetting.maxAmount
    }
    mechanicCommission = Math.round(mechanicCommission * 100) / 100

    const total = subtotal + platformFee

    const paymentBreakdownMetadata = {
      currency: settings?.currency || "NGN",
      vendorPartsSubtotal: vendorPartPrice,
      mechanicLaborCharges: mechanicServiceFee,
      mechanicDiagnosticFee: mechanicDiagnosticFee,
      mechanicServiceAmount: mechanicTotal,
      pickupFee,
      mechanicGrossForPayout,
      combinedSubtotalBeforePlatformFee: subtotal,
      platformFee,
      platformFeeRate,
      vendorCommission,
      vendorCommissionRate,
      mechanicCommission,
      mechanicCommissionRate,
      mechanicTax,
      mechanicTaxRate,
      customerTax: 0,
      customerTaxRate: 0,
      total,
      offerId,
      serviceRequestId: mechanicOffer.serviceRequestId,
      partRequestId: metadata.requestId,
      vendorOfferId: metadata.offerId,
    }

    const payOk =
      paymentData?.status === "succeeded" ||
      paymentData?.status === "SUCCEEDED" ||
      paymentData?.status === "PAID" ||
      paymentData?.status === "COMPLETED"

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Update mechanic offer status to ACCEPTED
      await tx.mechanicOffer.update({
        where: { id: offerId },
        data: { status: "ACCEPTED" }
      })

      // Reject all other pending mechanic offers for this service request
      await tx.mechanicOffer.updateMany({
        where: {
          serviceRequestId: mechanicOffer.serviceRequestId,
          id: { not: offerId },
          status: "PENDING"
        },
        data: { status: "REJECTED" }
      })

      // Update service request status
      await tx.mechanicServiceRequest.update({
        where: { id: mechanicOffer.serviceRequestId },
        data: { status: "ACCEPTED" }
      })

      // Update PartRequest status to ACCEPTED when both vendor and mechanic offers are accepted
      const serviceRequestMetadataUp = mechanicOffer.serviceRequest as any
      if (serviceRequestMetadataUp?.requestId) {
        await tx.partRequest.update({
          where: { id: serviceRequestMetadataUp.requestId },
          data: { status: "ACCEPTED" }
        })
      }

      // Get current metadata
      const currentMetadata = (order.metadata as any) || {}
      
      // Generate unique handover code for vendor verification (generate early so we can store it)
      const handoverCode = `HOV-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`
      
      // Update order with final totals, commissions, and metadata
      // serviceFee = platform fee; tax = 0 for AUTO_PARTS customer checkout
      let finalOrder = await (tx.order.update as any)({
        where: { id: order.id },
        data: {
          status: "PENDING", // Will be updated to CONFIRMED after payment
          subtotal: vendorPartPrice,
          serviceFee: platformFee,
          tax: 0,
          total,
          vendorCommission,
          platformCommission: platformFee,
          paymentStatus: "PENDING",
          paymentMethod: paymentMethod || null,
          notes: notes || `Accepted mechanic offer. Combined with vendor offer for ${(order.orderItems?.[0] as any)?.productName || 'parts'}`,
          metadata: {
            ...currentMetadata,
            // Tax and fee information
            mechanicTax: mechanicTax,
            mechanicTaxRate: mechanicTaxRate,
            customerTax: 0,
            customerTaxRate: 0,
            platformFee: platformFee,
            platformFeeRate: platformFeeRate,
            mechanicCommission,
            mechanicCommissionRate,
            // Customer receipt breakdown (order.subtotal is vendor parts only)
            vendorPartsSubtotal: vendorPartPrice,
            mechanicLaborCharges: mechanicServiceFee,
            mechanicDiagnosticFee: mechanicDiagnosticFee,
            mechanicServiceAmount: mechanicTotal,
            mechanicGrossForPayout,
            mechanicPickupIncludedInGross: pickupFee,
            combinedSubtotalBeforeTax: subtotal,
            // Handover code for vendor verification
            handoverCode: handoverCode,
            // Mechanic information
            mechanicId: mechanicOffer.mechanicId,
            mechanicName: mechanicOffer.mechanic.mechanicProfile?.businessName || mechanicOffer.mechanic.name || "Mechanic",
            // Service request information
            serviceRequestId: mechanicOffer.serviceRequestId,
            // Order and offer information
            vendorOfferId: metadata.offerId,
            partRequestId: metadata.requestId,
            // Pickup information
            pickupFee: pickupFee,
            pickupDistance: metadata.pickupDistance,
            vendorAddress: metadata.vendorAddress,
            vendorLatitude: metadata.vendorLatitude,
            vendorLongitude: metadata.vendorLongitude,
          }
        }
      })

      // Create payment record if payment data provided
      if (paymentData) {
        await tx.payment.create({
          data: {
            userId: user.id,
            orderId: order.id,
            amount: total,
            currency: settings?.currency || "NGN",
            status: payOk ? "PAID" : "PENDING",
            gateway: paymentData.gateway || 'STRIPE',
            gatewayTransactionId: paymentData.id || paymentData.transactionId || undefined,
            metadata: {
              ...paymentData,
              autoPartsBreakdown: paymentBreakdownMetadata,
            },
          },
        })
      }

      // Update order payment status if payment succeeded
      // Also update serviceFee and tax to ensure they're correct
      

      if (payOk) {
        finalOrder = await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: "PAID",
            status: "CONFIRMED",
            serviceFee: platformFee,
            tax: 0,
          },
        } as any)

        // Create wallets and transactions for vendor and mechanic when payment succeeds
        let vendorWallet = await tx.wallet.findUnique({
          where: { userId: finalOrder.vendorId || undefined },
        })

        if (!vendorWallet) {
          vendorWallet = await tx.wallet.create({
            data: {
              userId: finalOrder.vendorId!,
              balance: 0,
              currency: settings?.currency || "NGN"
            }
          })
        }

        // Platform fee is customer-only; vendor nets part price minus VENDOR_COMMISSION
        const vendorEarnings = Math.round((vendorPartPrice - vendorCommission) * 100) / 100
        
        // Don't increment wallet balance yet - wait for customer approval
        // Get current balance for transaction record
        const currentVendorBalance = vendorWallet.balance

        // Create PENDING wallet transaction for vendor (will be completed when customer approves)
        await tx.walletTransaction.create({
          data: {
            userId: order.vendorId!,
            type: "CREDIT",
            amount: vendorEarnings,
            balance: currentVendorBalance, // Current balance (not incremented yet)
            description: `Vendor earnings from order #${order.orderNumber}`,
            reference: `VENDOR-EARN-${order.id}`,
            orderId: order.id,
            status: "PENDING", // PENDING until customer approves completed job
            metadata: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              vendorCommission: vendorCommission,
              vendorCommissionRate: vendorCommissionRate,
              platformFee,
              platformFeeRate,
              partPrice: vendorPartPrice,
              vendorEarnings: vendorEarnings,
              module: "AUTO_PARTS",
              mechanicAssigned: true,
              serviceRequestId: mechanicOffer.serviceRequestId, // Link to service request for approval
            }
          }
        })

        // Create VendorCommission record for vendor commission deduction
        if (vendorCommission > 0) {
          await tx.vendorCommission.create({
            data: {
              vendorId: order.vendorId!,
              orderId: order.id,
              module: "AUTO_PARTS",
              commissionType: "VENDOR_COMMISSION",
              orderAmount: vendorPartPrice,
              commissionRate: vendorCommissionRate,
              commissionAmount: vendorCommission,
              status: "PAID"
            }
          })
        }

        if (platformFee > 0) {
          await tx.vendorCommission.create({
            data: {
              vendorId: order.vendorId!,
              orderId: order.id,
              module: "AUTO_PARTS",
              commissionType: "PLATFORM_FEE",
              orderAmount: subtotal,
              commissionRate: platformFeeRate,
              commissionAmount: platformFee,
              status: "PAID",
            },
          })
        }

        if (mechanicCommission > 0) {
          await tx.vendorCommission.create({
            data: {
              vendorId: mechanicOffer.mechanicId,
              orderId: order.id,
              module: "AUTO_PARTS",
              commissionType: "MECHANIC_COMMISSION" as any,
              orderAmount: mechanicGrossForPayout,
              commissionRate: mechanicCommissionRate,
              commissionAmount: mechanicCommission,
              status: "PAID",
            },
          })
        }

        // Get or create mechanic wallet
      
        const mechanicUserId = mechanicOffer.mechanic.id
        let mechanicWallet = await tx.wallet.findUnique({
          where: { userId: mechanicUserId }
        })

        if (!mechanicWallet) {
          mechanicWallet = await tx.wallet.create({
            data: {
              userId: mechanicUserId,
              balance: 0,
              currency: settings?.defaultCurrency || "NGN"
            }
          })
        }

        const mechanicEarnings = Math.max(
          0,
          Math.round((mechanicGrossForPayout - mechanicTax - mechanicCommission) * 100) / 100
        )
        
        // Don't increment wallet balance yet - wait for customer approval
        // Get current balance for transaction record
        const currentMechanicBalance = mechanicWallet.balance

        // Create PENDING wallet transaction for mechanic (will be completed when customer approves)
        await tx.walletTransaction.create({
          data: {
            userId: mechanicUserId,
            type: "CREDIT",
            amount: mechanicEarnings,
            balance: currentMechanicBalance, // Current balance (not incremented yet)
            description: `Mechanic earnings from order #${order.orderNumber}`,
            reference: `MECHANIC-EARN-${order.id}`,
            orderId: order.id,
            status: "PENDING", // PENDING until customer approves completed job
            metadata: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              pickupFee,
              mechanicLaborTotal: mechanicTotal,
              mechanicGrossForPayout,
              mechanicTax,
              mechanicTaxRate,
              mechanicCommission,
              mechanicCommissionRate,
              mechanicTotal: mechanicTotal,
              mechanicEarnings,
              autoPartsBreakdown: paymentBreakdownMetadata,
              module: "AUTO_PARTS",
              serviceRequestId: mechanicOffer.serviceRequestId,
            }
          }
        })

        // Create VendorCommission record for MECHANIC_TAX (deducted from mechanic)
        if (mechanicTax > 0) {
          await tx.vendorCommission.create({
            data: {
              vendorId: order.vendorId!, // Associate with vendor for commission tracking
              orderId: order.id,
              module: "AUTO_PARTS",
              commissionType: "MECHANIC_TAX" as any,
              orderAmount: mechanicGrossForPayout,
              commissionRate: mechanicTaxRate,
              commissionAmount: mechanicTax,
              status: "PAID"
            }
          })
        }

        // Create CustomerTax record
        if (customerTax > 0) {
          await (tx as any).customerTax.create({
            data: {
              customerId: user.id,
              orderId: order.id,
              module: "AUTO_PARTS",
              orderAmount: subtotal,
              taxRate: customerTaxRate,
              taxAmount: customerTax,
              status: "PAID",
              paidAt: new Date()
            }
          })
        }
      }

      // Update service request metadata with handover code (handoverCode already generated above)
      const serviceRequestMetadata = (mechanicOffer.serviceRequest.metadata as any) || {}
      await (tx.mechanicServiceRequest.update as any)({
        where: { id: mechanicOffer.serviceRequestId },
        data: {
          metadata: {
            ...serviceRequestMetadata,
            handoverCode: handoverCode,
            orderId: order.id,
          }
        }
      })

      // Update order tracking
      await tx.orderTracking.create({
        data: {
          orderId: order.id,
          status: payOk ? "CONFIRMED" : "PENDING",
          notes: `Mechanic offer accepted. Total: ${settings?.currency || "NGN"} ${Number(total).toFixed(2)}. Payment ${payOk ? "completed" : "pending"}.`,
          timestamp: new Date().toISOString()
        }
      } as any)

      // Mechanic will handle pickup and delivery, so no courier booking needed
      // Courier booking is only created when customer doesn't need a mechanic
      return { order: finalOrder, mechanicOffer, courierBooking: null }
    })

    // Send notifications
    const socketServer = getGlobalSocketServer()
    if (metadata?.requestId) {
      socketServer.emitAutoPartsRequestRoom(metadata.requestId, {
        type: "mechanic_offer_accepted",
        orderId: result.order.id,
        status: (result.order as any).status,
      })
    }
    await broadcastAutoPartsOrderEvent({
      orderId: result.order.id,
      status: String((result.order as any).status || ""),
      event: "order_updated",
    })
    const orderMetadata = ((result.order as any).metadata as any) || {}
    // handoverCode is now stored in order metadata, so get it from there
    const handoverCode = orderMetadata.handoverCode || `HOV-${Date.now().toString().slice(-6)}` // Fallback just in case
    const mechanicName = orderMetadata.mechanicName || (mechanicOffer.mechanic.mechanicProfile?.businessName || mechanicOffer.mechanic.name || "Mechanic")
    
    // Notify mechanic
    await NotificationBridge.sendNotification({
      userId: mechanicOffer.mechanicId,
      title: 'Offer Accepted',
      message: `Your offer has been accepted. Order #${result.order.orderNumber}. Please proceed to pick up the parts from the vendor.`,
      type: 'MECHANIC_OFFER_ACCEPTED',
      module: 'AUTO_PARTS',
      actionUrl: `/auto-parts/mechanics/service-requests/${mechanicOffer.serviceRequestId}`,
      data: {
        actionType: 'navigate',
        screen: 'MechanicServiceRequestDetails',
        params: [
          { name: 'serviceRequestId', value: mechanicOffer.serviceRequestId },
        ],
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
      }
    })
    
    socketServer?.sendNotificationToUser(mechanicOffer.mechanicId, {
      type: 'notification',
      title: 'Offer Accepted',
      message: `Your offer has been accepted. Order #${result.order.orderNumber}`,
      orderId: result.order.id,
      orderNumber: result.order.orderNumber
    })

    // Notify vendor with handover code
    await NotificationBridge.sendNotification({
      userId: order.vendorId!,
      title: 'Mechanic Assigned',
      message: `${mechanicName} is coming to pick up the parts. Handover Code: ${handoverCode}. Please verify this code when handing over the parts.`,
      type: 'VENDOR_HANDOVER_CODE',
      module: 'AUTO_PARTS',
      actionUrl: `/auto-parts/orders/${result.order.id}`,
      data: {
        actionType: 'navigate',
        screen: 'AutoPartsVendorOrderDetails',
        params: [
          { name: 'orderId', value: result.order.id },
        ],
        handoverCode: handoverCode,
        mechanicName: mechanicName,
        orderNumber: result.order.orderNumber,
      }
    })
    
    socketServer?.sendNotificationToUser(order.vendorId!, {
      type: 'notification',
      title: 'Mechanic Assigned',
      message: `${mechanicName} is coming to pick up parts. Code: ${handoverCode}`,
      orderId: result.order.id,
      handoverCode: handoverCode
    })

    // Find courier booking by orderId if it exists (for cases where no mechanic was needed)
    let courierBooking: any = null
    try {
      const courierRes = await prisma.courierBooking.findFirst({
        where: { orderId: result.order.id }
      })
      courierBooking = courierRes || null
    } catch (e) {
      // Ignore if not found
    }

    return NextResponse.json({
      success: true,
      data: {
        order: result.order,
        mechanicOffer: result.mechanicOffer,
        courierBooking: courierBooking,
        handoverCode: handoverCode,
        message: `Order #${result.order.orderNumber} finalized successfully. Total: ${total}`
      }
    })

  } catch (error: any) {
    console.error("Accept mechanic offer error:", error)
    return NextResponse.json(
      { error: "Failed to accept mechanic offer", details: error.message },
      { status: 500 }
    )
  }
}

