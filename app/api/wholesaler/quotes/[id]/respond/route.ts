import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "WHOLESALER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { 
      response, 
      pricing, 
      deliveryTerms, 
      paymentTerms, 
      estimatedDeliveryDate,
      notes,
      paymentMethod,
      deliveryAddress,
      deliveryLatitude,
      deliveryLongitude,
      wholesalerAddress,
      pickupLatitude,
      pickupLongitude,
      orderWeight,
      allowCOD,
      allowOnlinePayment
    } = body

    console.log(response, 'response')
    // Validate response
    if (!response || !["ACCEPT", "REJECT", "COUNTER_OFFER"].includes(response)) {
      return NextResponse.json(
        { error: "Valid response (ACCEPT, REJECT, COUNTER_OFFER) is required" },
        { status: 400 }
      )
    }

    // Get wholesaler
    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    // Get the supplier order
    const supplierOrder = await prisma.supplierOrder.findUnique({
      where: { 
        id: params.id,
        wholesalerId: wholesaler.id,
        isQuote: true
      },
      include: {
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true,
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

    if (supplierOrder.status !== "QUOTE_SENT") {
      return NextResponse.json(
        { error: "Quote has already been responded to" },
        { status: 400 }
      )
    }

    // Update supplier order with response
    const updateData: any = {
      status: response === "ACCEPT" ? "QUOTE_ACCEPTED" : 
             response === "REJECT" ? "QUOTE_REJECTED" : "QUOTE_RECEIVED",
      supplierResponse: {
        response,
        pricing: pricing || {},
        deliveryTerms,
        paymentTerms,
        // itemWeight: orderWeight,
        estimatedDeliveryDate,
        notes,
        respondedAt: new Date(),
        ...(paymentMethod && { paymentMethod }),
        ...(deliveryAddress && { deliveryAddress }),
        ...(wholesalerAddress && { wholesalerAddress }),
        ...(orderWeight && { orderWeight }),
        allowCOD: false, // Always false - no COD allowed
        allowOnlinePayment: true // Always true - only online payment
      },
      expectedDeliveryDate: estimatedDeliveryDate ? new Date(estimatedDeliveryDate) : null
    }

    // If accepting, update order type and payment status
    // Payment is always PAY_NOW (no COD allowed)
    if (response === "ACCEPT") {
      updateData.orderType = "CONFIRMED_ORDER"
      updateData.paymentStatus = "PENDING" // Always pending for PAY_NOW
    }
    
    // Always update address data if provided (regardless of response type)
    if (deliveryAddress) {
      updateData.deliveryAddress = deliveryAddress
      if (deliveryLatitude && deliveryLongitude) {
        updateData.deliveryLatitude = deliveryLatitude
        updateData.deliveryLongitude = deliveryLongitude
      }
    }
    
    if (wholesalerAddress) {
      updateData.pickupAddress = wholesalerAddress
      if (pickupLatitude && pickupLongitude) {
        updateData.pickupLatitude = pickupLatitude
        updateData.pickupLongitude = pickupLongitude
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
            companyName: true
          }
        },
        items: true,
      }
    })

    // Send notification to pharmacy
    const { NotificationBridge } = await import("@/lib/notification-bridge")
    
    let notificationMessage = ""
    if (response === "ACCEPT") {
      notificationMessage = `${wholesaler.companyName} has accepted your quote`
    } else if (response === "REJECT") {
      notificationMessage = `${wholesaler.companyName} has rejected your quote`
    } else {
      notificationMessage = `${wholesaler.companyName} has sent a counter-offer for your quote`
    }

    await NotificationBridge.sendNotification({
      userId: supplierOrder.pharmacy.userId,
      title: "Quote Response",
      message: notificationMessage,
      type: "ORDER_UPDATE",
      module: "PHARMACY",
      actionUrl: `/pharmacy/quotes/${supplierOrder.id}`,
      data: {
        actionType: "navigate",
        screen: 'SupplierQuotes',
        params: [
          { name: 'quoteId', value: supplierOrder.id },
        ],
        orderId: supplierOrder.id,
        response,
        wholesalerName: wholesaler.companyName
      }
    })

    return NextResponse.json({
      message: "Quote response sent successfully",
      order: {
        id: updatedOrder.id,
        status: updatedOrder.status,
        supplierResponse: updatedOrder.supplierResponse,
        expectedDeliveryDate: updatedOrder.expectedDeliveryDate
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
