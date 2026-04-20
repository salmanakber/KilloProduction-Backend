import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { isValidLatLon } from "@/lib/geo"

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
      counterOffer,
    } = body as {
      response?: string
      pricing?: unknown
      deliveryTerms?: string
      paymentTerms?: string
      estimatedDeliveryDate?: string
      notes?: string
      paymentMethod?: string
      deliveryAddress?: string
      deliveryLatitude?: number
      deliveryLongitude?: number
      wholesalerAddress?: string
      pickupLatitude?: number
      pickupLongitude?: number
      orderWeight?: number
      counterOffer?: {
        markupPercent?: number
        minOrderQuantity?: number
        deliveryDate?: string
        /** @deprecated single blended unit price — prefer markupPercent */
        unitPrice?: number
      }
    }

    if (!response || !["ACCEPT", "REJECT", "COUNTER_OFFER"].includes(response)) {
      return NextResponse.json(
        { error: "Valid response (ACCEPT, REJECT, COUNTER_OFFER) is required" },
        { status: 400 }
      )
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    const supplierOrder = await prisma.supplierOrder.findUnique({
      where: {
        id: params.id,
        wholesalerId: wholesaler.id,
        isQuote: true,
      },
      include: {
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true,
            userId: true,
            address: true,
            lat: true,
            lon: true,
          },
        },
        items: true,
      },
    })

    if (!supplierOrder) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    }

    if (supplierOrder.status !== "QUOTE_SENT") {
      return NextResponse.json(
        { error: "Quote has already been responded to" },
        { status: 400 }
      )
    }

    if (response === "COUNTER_OFFER") {
      const mp = Number(counterOffer?.markupPercent)
      if (!Number.isFinite(mp) || mp < -99 || mp > 500) {
        return NextResponse.json(
          { error: "counterOffer.markupPercent is required (e.g. 5 for +5% on all lines, or -3 for −3%)" },
          { status: 400 }
        )
      }
    }

    if (response === "ACCEPT" || response === "COUNTER_OFFER") {
      const dLat =
        deliveryLatitude != null
          ? Number(deliveryLatitude)
          : supplierOrder.deliveryLatitude != null
            ? Number(supplierOrder.deliveryLatitude)
            : supplierOrder.pharmacy.lat != null
              ? Number(supplierOrder.pharmacy.lat)
              : NaN
      const dLon =
        deliveryLongitude != null
          ? Number(deliveryLongitude)
          : supplierOrder.deliveryLongitude != null
            ? Number(supplierOrder.deliveryLongitude)
            : supplierOrder.pharmacy.lon != null
              ? Number(supplierOrder.pharmacy.lon)
              : NaN

      const pLat =
        pickupLatitude != null
          ? Number(pickupLatitude)
          : wholesaler.latitude != null
            ? Number(wholesaler.latitude)
            : NaN
      const pLon =
        pickupLongitude != null
          ? Number(pickupLongitude)
          : wholesaler.longitude != null
            ? Number(wholesaler.longitude)
            : NaN

      if (!isValidLatLon(dLat, dLon)) {
        return NextResponse.json(
          {
            error:
              "Delivery coordinates are required. Ensure the pharmacy drop-off has valid latitude and longitude (select the address from suggestions or save pharmacy coordinates on the buyer profile).",
          },
          { status: 400 }
        )
      }
      if (!isValidLatLon(pLat, pLon)) {
        return NextResponse.json(
          {
            error:
              "Pickup coordinates are required. Set your warehouse address with map location in wholesaler profile, or send pickupLatitude and pickupLongitude.",
          },
          { status: 400 }
        )
      }
    }

    const previousTotalAmount = supplierOrder.totalAmount
    const lineSnapshots = supplierOrder.items.map((it) => ({
      id: it.id,
      productName: it.productName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      totalPrice: it.totalPrice,
    }))

    let newTotalAmount = previousTotalAmount
    let markupPercentForStore: number | null = null

    if (response === "COUNTER_OFFER" && counterOffer) {
      markupPercentForStore = Number(counterOffer.markupPercent)
      const factor = 1 + markupPercentForStore / 100
      let sum = 0
      const ops = supplierOrder.items.map((it) => {
        const newUnit = Math.round(it.unitPrice * factor * 100) / 100
        const newLine = Math.round(newUnit * it.quantity * 100) / 100
        sum += newLine
        return prisma.supplierOrderItem.update({
          where: { id: it.id },
          data: {
            unitPrice: newUnit,
            totalPrice: newLine,
          },
        })
      })
      await prisma.$transaction(ops)
      newTotalAmount = Math.round(sum * 100) / 100
    }

    const baseSupplierResponse = {
      response,
      pricing: pricing || {},
      deliveryTerms,
      paymentTerms,
      estimatedDeliveryDate,
      notes,
      respondedAt: new Date().toISOString(),
      ...(paymentMethod && { paymentMethod }),
      ...(deliveryAddress && { deliveryAddress }),
      ...(wholesalerAddress && { wholesalerAddress }),
      ...(orderWeight != null && { orderWeight }),
      allowCOD: false,
      allowOnlinePayment: true,
      previousTotalAmount,
      ...(response === "COUNTER_OFFER" && counterOffer
        ? {
            counterOffer: {
              markupPercent: markupPercentForStore,
              minOrderQuantity: counterOffer.minOrderQuantity ?? 1,
              deliveryDate: counterOffer.deliveryDate,
              previousTotalAmount,
              newTotalAmount,
              lineItemsBefore: lineSnapshots,
            },
          }
        : {}),
    }

    const updateData: Record<string, unknown> = {
      status:
        response === "REJECT"
          ? "QUOTE_REJECTED"
          : "QUOTE_RECEIVED",
      supplierResponse: baseSupplierResponse,
      expectedDeliveryDate: estimatedDeliveryDate ? new Date(estimatedDeliveryDate) : null,
    }

    if (response === "COUNTER_OFFER") {
      updateData.totalAmount = newTotalAmount
    }

    if (deliveryAddress) {
      updateData.deliveryAddress = deliveryAddress
    }
    if (response === "ACCEPT" || response === "COUNTER_OFFER") {
      const dLat =
        deliveryLatitude != null
          ? Number(deliveryLatitude)
          : supplierOrder.deliveryLatitude != null
            ? Number(supplierOrder.deliveryLatitude)
            : supplierOrder.pharmacy.lat != null
              ? Number(supplierOrder.pharmacy.lat)
              : NaN
      const dLon =
        deliveryLongitude != null
          ? Number(deliveryLongitude)
          : supplierOrder.deliveryLongitude != null
            ? Number(supplierOrder.deliveryLongitude)
            : supplierOrder.pharmacy.lon != null
              ? Number(supplierOrder.pharmacy.lon)
              : NaN
      const pLat =
        pickupLatitude != null
          ? Number(pickupLatitude)
          : wholesaler.latitude != null
            ? Number(wholesaler.latitude)
            : NaN
      const pLon =
        pickupLongitude != null
          ? Number(pickupLongitude)
          : wholesaler.longitude != null
            ? Number(wholesaler.longitude)
            : NaN
      if (isValidLatLon(dLat, dLon)) {
        updateData.deliveryLatitude = dLat
        updateData.deliveryLongitude = dLon
      }
      if (isValidLatLon(pLat, pLon)) {
        updateData.pickupLatitude = pLat
        updateData.pickupLongitude = pLon
      }
    } else if (deliveryAddress && deliveryLatitude != null && deliveryLongitude != null) {
      updateData.deliveryLatitude = deliveryLatitude
      updateData.deliveryLongitude = deliveryLongitude
    }

    if (wholesalerAddress && response !== "ACCEPT" && response !== "COUNTER_OFFER") {
      updateData.pickupAddress = wholesalerAddress
      if (pickupLatitude != null && pickupLongitude != null) {
        updateData.pickupLatitude = pickupLatitude
        updateData.pickupLongitude = pickupLongitude
      }
    }
    if (wholesalerAddress && (response === "ACCEPT" || response === "COUNTER_OFFER")) {
      updateData.pickupAddress = wholesalerAddress
    }

    const updatedOrder = await prisma.supplierOrder.update({
      where: { id: params.id },
      data: updateData as any,
      include: {
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true,
            userId: true,
          },
        },
        wholesaler: {
          select: {
            id: true,
            companyName: true,
          },
        },
        items: true,
      },
    })

    const { NotificationBridge } = await import("@/lib/notification-bridge")

    let notificationMessage = ""
    if (response === "ACCEPT") {
      notificationMessage = `${wholesaler.companyName} accepted your quote — please confirm terms in the app`
    } else if (response === "REJECT") {
      notificationMessage = `${wholesaler.companyName} has rejected your quote`
    } else {
      notificationMessage = `${wholesaler.companyName} sent a counter-offer (markup on line items)`
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
        screen: "SupplierQuotes",
        params: [{ name: "quoteId", value: supplierOrder.id }],
        orderId: supplierOrder.id,
        response,
        wholesalerName: wholesaler.companyName,
      },
    })

    return NextResponse.json({
      message: "Quote response sent successfully",
      order: {
        id: updatedOrder.id,
        status: updatedOrder.status,
        totalAmount: updatedOrder.totalAmount,
        supplierResponse: updatedOrder.supplierResponse,
        expectedDeliveryDate: updatedOrder.expectedDeliveryDate,
        items: updatedOrder.items,
      },
    })
  } catch (error) {
    console.error("Quote response error:", error)
    return NextResponse.json({ error: "Failed to respond to quote" }, { status: 500 })
  }
}
