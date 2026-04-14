import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { WalletService } from "@/lib/wallet-service"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "PHARMACY" as any) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    const body = await request.json()
    const { 
      response, 
      notes,
      counterOffer,
      orderWeight,
      allowCOD,
      allowOnlinePayment,
      vehicleType,
      deliveryCharges,
      commissionAmount,
      totalAmount,
      pharmacyAddress,
      wholesalerAddress
    } = body

    // Validate response
    if (!response || !["ACCEPT", "REJECT", "COUNTER_OFFER"].includes(response)) {
      return NextResponse.json(
        { error: "Valid response (ACCEPT, REJECT, COUNTER_OFFER) is required" },
        { status: 400 }
      )
    }

    // Get the supplier order
    const supplierOrder = await prisma.supplierOrder.findUnique({
      where: { 
        id: params.id,
        pharmacyId: pharmacy.id,
        status: "QUOTE_SENT"
      },
      include: {
        wholesaler: {
          select: {
            id: true,
            companyName: true,
            userId: true
          }
        },
        items: true,
      }
    })

    if (!supplierOrder) {
      return NextResponse.json(
        { error: "Quote not found" },
        { status: 404 }
      )
    }

    // Update supplier order with response
    const updateData: any = {
      status: response === "ACCEPT" ? "QUOTE_ACCEPTED" : 
             response === "REJECT" ? "QUOTE_REJECTED" : "QUOTE_RECEIVED",
      pharmacyResponse: {
        response,
        notes: notes || null,
        respondedAt: new Date(),
        ...(counterOffer && { counterOffer }),
        ...(orderWeight && { orderWeight }),
        ...(allowCOD !== undefined && { allowCOD }),
        ...(allowOnlinePayment !== undefined && { allowOnlinePayment }),
        ...(vehicleType && { vehicleType }),
        ...(deliveryCharges && { deliveryCharges }),
        ...(commissionAmount && { commissionAmount }),
        ...(totalAmount && { totalAmount })
      }
    }

    // Add address data if provided
    if (pharmacyAddress && pharmacyAddress.fullAddress) {
      updateData.deliveryAddress = pharmacyAddress.fullAddress
      updateData.deliveryLatitude = pharmacyAddress.latitude || null
      updateData.deliveryLongitude = pharmacyAddress.longitude || null
    }

    if (wholesalerAddress && wholesalerAddress.fullAddress) {
      updateData.pickupAddress = wholesalerAddress.fullAddress
      updateData.pickupLatitude = wholesalerAddress.latitude || null
      updateData.pickupLongitude = wholesalerAddress.longitude || null
    }

    // If accepting, update order type and process commissions
    if (response === "ACCEPT") {
      updateData.orderType = "CONFIRMED_ORDER"
      
      // Process commission payments to wallets
      try {
        const commissionCalculation = await WalletService.calculateCommission(params.id)
        
        // Process platform commission (goes to system wallet)
        await WalletService.processCommissionPayment({
          userId: 'system', // System wallet
          orderId: params.id,
          amount: commissionCalculation.commissions.platform.amount,
          commissionType: 'PLATFORM_FEE',
          module: 'PHARMACY',
          description: `Platform commission for order ${supplierOrder.orderNumber}`
        })

        // Process vendor commission (wholesaler)
        await WalletService.processCommissionPayment({
          userId: supplierOrder.wholesaler.userId,
          orderId: params.id,
          amount: commissionCalculation.commissions.vendor.amount,
          commissionType: 'VENDOR_COMMISSION',
          module: 'PHARMACY',
          description: `Vendor commission for order ${supplierOrder.orderNumber}`
        })

        // Process rider commission if courier booking exists
        if (supplierOrder.courierBookingId) {
          const courierBooking = await prisma.courierBooking.findUnique({
            where: { id: supplierOrder.courierBookingId },
            include: { riderProfile: true }
          })

          if (courierBooking?.riderProfile) {
            await WalletService.processCommissionPayment({
              userId: courierBooking.riderProfile.userId,
              orderId: params.id,
              amount: commissionCalculation.commissions.rider.amount,
              commissionType: 'RIDER_COMMISSION',
              module: 'PHARMACY',
              description: `Rider commission for order ${supplierOrder.orderNumber}`
            })
          }
        }

        // Add commission info to response
        updateData.commissionInfo = {
          platformCommission: commissionCalculation.commissions.platform.amount,
          vendorCommission: commissionCalculation.commissions.vendor.amount,
          riderCommission: commissionCalculation.commissions.rider.amount,
          totalCommission: commissionCalculation.totalCommission
        }
      } catch (error) {
        console.error('Error processing commissions:', error)
        // Don't fail the order if commission processing fails
      }
    }

    const updatedOrder = await prisma.supplierOrder.update({
      where: { id: params.id },
      data: updateData,
      include: {
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true,
            userId: true
          }
        },
        wholesaler: {
          select: {
            id: true,
            companyName: true,
            userId: true
          }
        },
        items: true,
      }
    })

    // Send notification to wholesaler
    const { NotificationBridge } = await import("@/lib/notification-bridge")
    
    let notificationMessage = ""
    if (response === "ACCEPT") {
      notificationMessage = `${pharmacy.pharmacyName} has accepted your quote`
    } else if (response === "REJECT") {
      notificationMessage = `${pharmacy.pharmacyName} has rejected your quote`
    } else {
      notificationMessage = `${pharmacy.pharmacyName} has sent a counter-offer for your quote`
    }

    await NotificationBridge.sendNotification({
      userId: supplierOrder.wholesaler.userId,
      title: "Quote Response",
      message: notificationMessage,
      type: "ORDER_UPDATE",
      module: "PHARMACY",
      actionUrl: `/wholesaler/quotes/${supplierOrder.id}`,
      data: {
        actionType: "navigate",
        screen: 'WholesalerQuoteDetails',
        params: [
          { name: 'quoteId', value: supplierOrder.id },
        ],
        orderId: supplierOrder.id,
        response,
        pharmacyName: pharmacy.pharmacyName
      }
    })

    return NextResponse.json({
      message: "Quote response sent successfully",
      order: {
        id: updatedOrder.id,
        status: updatedOrder.status,
        pharmacyResponse: updatedOrder.pharmacyResponse
      }
    })
  } catch (error) {
    console.error("Quote response error:", error)
    return NextResponse.json(
      { error: "Failed to respond to quote" },
      { status: 500 }
    )
  }
}
