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
      notes 
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
        wholesalerId: user.id,
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
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unitPrice: true
              }
            }
          }
        }
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
    const updatedOrder = await prisma.supplierOrder.update({
      where: { id: params.id },
      data: {
        status: response === "ACCEPT" ? "QUOTE_ACCEPTED" : 
               response === "REJECT" ? "QUOTE_REJECTED" : "QUOTE_RECEIVED",
        supplierResponse: {
          response,
          pricing: pricing || {},
          deliveryTerms,
          paymentTerms,
          estimatedDeliveryDate,
          notes,
          respondedAt: new Date()
        },
        expectedDeliveryDate: estimatedDeliveryDate ? new Date(estimatedDeliveryDate) : null
      },
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
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unitPrice: true
              }
            }
          }
        }
      }
    })

    // Send notification to pharmacy
    const { NotificationBridge } = await import("@/lib/notification-bridge")
    
    let notificationMessage = ""
    if (response === "ACCEPT") {
      notificationMessage = `${supplierOrder.wholesaler.companyName} has accepted your quote`
    } else if (response === "REJECT") {
      notificationMessage = `${supplierOrder.wholesaler.companyName} has rejected your quote`
    } else {
      notificationMessage = `${supplierOrder.wholesaler.companyName} has sent a counter-offer for your quote`
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
        wholesalerName: supplierOrder.wholesaler.companyName
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
