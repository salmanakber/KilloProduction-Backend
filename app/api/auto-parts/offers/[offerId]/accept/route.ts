import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getGlobalSocketServer } from "@/lib/socket-server"

function generateOrderNumber(): string {
  return `AP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

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

function isPaymentSucceeded(paymentData: unknown): boolean {
  if (!paymentData || typeof paymentData !== "object") return false
  const s = String((paymentData as { status?: string }).status || "")
  return ["succeeded", "SUCCEEDED", "PAID", "COMPLETED"].includes(s)
}

function clampFeeAmount(
  amount: number,
  setting: { minAmount?: number | null; maxAmount?: number | null } | null | undefined
): number {
  let a = amount
  if (setting?.minAmount != null && a < setting.minAmount) a = setting.minAmount
  if (setting?.maxAmount != null && a > setting.maxAmount) a = setting.maxAmount
  return Math.round(a * 100) / 100
}

/**
 * Courier + paid settlement: platform fee is customer-only; vendor nets partPrice − VENDOR_COMMISSION.
 */
async function applyAutoPartsCourierPaidSettlement(
  tx: any,
  params: {
    orderId: string
    orderNumber: string
    customerId: string
    customerName: string | null
    customerPhone: string | null
    vendorUserId: string
    partName: string
    partPrice: number
    partRequestId: string
    vendorOfferId: string
    address: {
      latitude: number
      longitude: number
      street?: string | null
      city?: string | null
      state?: string | null
    }
    vendorProfile: {
      latitude: number
      longitude: number
      address?: string | null
    }
    paymentData: Record<string, unknown>
    paymentMethod?: string | null
    courierRideTypeId?: string | null
    deliveryFee?: number | null
  }
): Promise<{ courierBooking: any }> {
  const existingCb = await tx.courierBooking.findFirst({
    where: { orderId: params.orderId },
  })
  if (existingCb) {
    return { courierBooking: existingCb }
  }

  let courierRideType: any = null
  if (params.courierRideTypeId) {
    courierRideType = await tx.rideType.findUnique({
      where: {
        id: params.courierRideTypeId,
        category: "COURIER",
        isActive: true,
      },
    })
  }
  if (!courierRideType) {
    courierRideType = await tx.rideType.findFirst({
      where: { category: "COURIER", isActive: true },
      orderBy: { basePrice: "asc" },
    })
  }
  if (!courierRideType) {
    throw new Error("No active courier ride type")
  }

  let fare = params.deliveryFee || 0
  let distance = 0
  let estimatedTime = 0
  const { address, vendorProfile } = params

  if (!params.deliveryFee) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (apiKey) {
      try {
        const origin = `${vendorProfile.latitude},${vendorProfile.longitude}`
        const destination = `${address.latitude},${address.longitude}`
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&units=metric&key=${apiKey}`
        const response = await fetch(url)
        if (response.ok) {
          const data = await response.json()
          if (data.status === "OK" && data.rows[0]?.elements[0]?.status === "OK") {
            const element = data.rows[0].elements[0]
            distance = element.distance.value / 1000
            estimatedTime = Math.ceil(element.duration.value / 60)
            fare = courierRideType.basePrice + distance * courierRideType.pricePerKm
            if (courierRideType.pricePerMinute > 0) {
              fare += estimatedTime * courierRideType.pricePerMinute
            }
            fare = Math.round(fare * 100) / 100
          }
        }
      } catch (e) {
        console.error("Distance matrix error:", e)
      }
    }
    if (fare === 0) {
      const R = 6371
      const dLat = ((address.latitude - vendorProfile.latitude) * Math.PI) / 180
      const dLon = ((address.longitude - vendorProfile.longitude) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((vendorProfile.latitude * Math.PI) / 180) *
          Math.cos((address.latitude * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      distance = R * c
      estimatedTime = Math.ceil(distance * 3)
      fare = courierRideType.basePrice + distance * courierRideType.pricePerKm
    }
  } else {
    distance =
      (params.deliveryFee! - (courierRideType.basePrice || 3.0)) / (courierRideType.pricePerKm || 1.5)
    estimatedTime = Math.ceil(distance * 3)
  }

  const courierBooking = await tx.courierBooking.create({
    data: {
      bookingNumber: `CB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      customerId: params.customerId,
      orderId: params.orderId,
      rideTypeId: courierRideType.id,
      pickupAddress: vendorProfile.address || "Vendor Location",
      pickupLatitude: vendorProfile.latitude,
      pickupLongitude: vendorProfile.longitude,
      dropAddress: `${address.street || ""}, ${address.city || ""}, ${address.state || ""}`.replace(/^,\s*|,\s*$/g, "").trim(),
      dropLatitude: address.latitude,
      dropLongitude: address.longitude,
      distance,
      estimatedTime,
      fare,
      status: "REQUESTED",
      paymentStatus: "PENDING",
      paymentMethod: params.paymentMethod || "CARD",
      packageType: "AUTO_PART",
      notes: `Auto parts delivery for order ${params.orderNumber}`,
      recipientName: params.customerName,
      recipientPhone: params.customerPhone || undefined,
    },
  })

  await tx.courierTracking.create({
    data: {
      bookingId: courierBooking.id,
      status: "REQUESTED",
      notes: "Booking created, looking for nearby riders",
    },
  })

  const commissionSettings = await tx.commissionSetting.findMany({
    where: { module: "AUTO_PARTS" },
  })
  const platformFeeSetting = commissionSettings.find((s: { commissionType: string }) => s.commissionType === "PLATFORM_FEE")
  const vendorCommissionSetting = commissionSettings.find((s: { commissionType: string }) => s.commissionType === "VENDOR_COMMISSION")

  const platformFeeRate = platformFeeSetting?.rate ?? 0
  const vendorCommissionRate = vendorCommissionSetting?.rate ?? 0

  let platformFeeAmount = (params.partPrice * platformFeeRate) / 100
  platformFeeAmount = clampFeeAmount(platformFeeAmount, platformFeeSetting)

  const vendorCommissionAmount = Math.round(((params.partPrice * vendorCommissionRate) / 100) * 100) / 100
  const vendorEarnings = Math.round((params.partPrice - vendorCommissionAmount) * 100) / 100

  const customerTotal = Math.round((params.partPrice + fare + platformFeeAmount) * 100) / 100

  const orderRow = await tx.order.findUnique({ where: { id: params.orderId } })
  const prevMeta = (orderRow?.metadata as Record<string, unknown>) || {}

  await tx.order.update({
    where: { id: params.orderId },
    data: {
      deliveryFee: fare,
      platformCommission: platformFeeAmount,
      vendorCommission: vendorCommissionAmount,
      total: customerTotal,
      paymentStatus: "PAID",
      paymentMethod: params.paymentMethod || "CARD",
      metadata: {
        ...prevMeta,
        courierBookingId: courierBooking.id,
        partRequestId: params.partRequestId,
        vendorOfferId: params.vendorOfferId,
      },
    } as any,
  })

  const existingPayment = await tx.payment.findFirst({ where: { orderId: params.orderId } })
  if (!existingPayment) {
    await tx.payment.create({
      data: {
        userId: params.customerId,
        orderId: params.orderId,
        amount: customerTotal,
        currency: String(params.paymentData.currency || "NGN"),
        status: "PAID",
        gateway: String(params.paymentData.gateway || "STRIPE"),
        gatewayTransactionId:
          (params.paymentData.id as string) || (params.paymentData.transactionId as string) || undefined,
        metadata: params.paymentData,
      },
    })
  }

  const existingWt = await tx.walletTransaction.findFirst({
    where: { reference: `VENDOR-EARN-${params.orderId}` },
  })
  if (!existingWt) {
    let vendorWallet = await tx.wallet.findUnique({ where: { userId: params.vendorUserId } })
    if (!vendorWallet) {
      vendorWallet = await tx.wallet.create({
        data: {
          userId: params.vendorUserId,
          balance: 0,
          currency: String(params.paymentData.currency || "NGN"),
        },
      })
    }
    const updatedVendorWallet = await tx.wallet.update({
      where: { id: vendorWallet.id },
      data: { balance: { increment: vendorEarnings } },
    })
    await tx.walletTransaction.create({
      data: {
        userId: params.vendorUserId,
        type: "CREDIT",
        amount: vendorEarnings,
        balance: updatedVendorWallet.balance,
        description: `Vendor earnings from order #${params.orderNumber} - ${params.partName}`,
        reference: `VENDOR-EARN-${params.orderId}`,
        orderId: params.orderId,
        status: "COMPLETED",
        metadata: {
          orderId: params.orderId,
          orderNumber: params.orderNumber,
          partName: params.partName,
          vendorCommission: vendorCommissionAmount,
          vendorCommissionRate,
          partPrice: params.partPrice,
          vendorEarnings,
          module: "AUTO_PARTS",
        },
      },
    })
  }

  const existingVc = await tx.vendorCommission.findFirst({
    where: { orderId: params.orderId, commissionType: "VENDOR_COMMISSION" },
  })
  if (!existingVc && vendorCommissionAmount > 0) {
    await tx.vendorCommission.create({
      data: {
        vendorId: params.vendorUserId,
        orderId: params.orderId,
        module: "AUTO_PARTS",
        commissionType: "VENDOR_COMMISSION",
        orderAmount: params.partPrice,
        commissionRate: vendorCommissionRate,
        commissionAmount: vendorCommissionAmount,
        status: "PAID",
      },
    })
  }

  const existingPf = await tx.vendorCommission.findFirst({
    where: { orderId: params.orderId, commissionType: "PLATFORM_FEE" },
  })
  if (!existingPf && platformFeeAmount > 0) {
    await tx.vendorCommission.create({
      data: {
        vendorId: params.vendorUserId,
        orderId: params.orderId,
        module: "AUTO_PARTS",
        commissionType: "PLATFORM_FEE",
        orderAmount: params.partPrice,
        commissionRate: platformFeeRate,
        commissionAmount: platformFeeAmount,
        status: "PAID",
      },
    })
  }

  return { courierBooking }
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

    const { offerId } = params
    const body = await request.json()
    const { 
      addressId,
      notes,
      paymentMethod,
      paymentData,
      courierRideTypeId,
      deliveryFee
    } = body

    // Get the offer with related data
    const offer = await prisma.partOffer.findUnique({
      where: { id: offerId },
      include: {
        request: {
          include: {
            user: true
          }
        },
        vendor: {
          include: {
            vendorProfile: {
              select: {
                businessName: true,
                latitude: true,
                longitude: true,
                address: true,
                city: true,
                state: true
              }
            }
          }
        }
      }
    })

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    }

    // Verify customer owns the request
    if (offer.request.userId !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    const requestData = offer.request as any
    const needsMechanic = requestData.needsMechanic || false
    const partPrice = offer.price
    const paymentOk = isPaymentSucceeded(paymentData)

    let address: any = null
    if (addressId) {
      address = await prisma.address.findUnique({
        where: { id: addressId, userId: user.id },
      })
      if (!address) {
        return NextResponse.json({ error: "Invalid delivery address" }, { status: 404 })
      }
    }

    /** Second step: customer paid after vendor offer was accepted — create courier, wallet, commissions. */
    if (offer.status === "ACCEPTED" && !needsMechanic && paymentOk) {
      if (!address) {
        return NextResponse.json({ error: "Delivery address required to complete payment" }, { status: 400 })
      }
      const vp = offer.vendor.vendorProfile
      if (!vp?.latitude || !vp?.longitude) {
        return NextResponse.json({ error: "Vendor location unavailable for delivery" }, { status: 400 })
      }
      const orderExisting = await prisma.order.findFirst({
        where: {
          partRequestId: offer.requestId,
          vendorId: offer.vendorId,
          module: "AUTO_PARTS",
        },
        orderBy: { createdAt: "desc" },
        include: {
          orderItems: true,
          address: true,
          vendor: {
            select: {
              name: true,
              vendorProfile: { select: { businessName: true } },
            },
          },
        },
      })
      if (!orderExisting) {
        return NextResponse.json({ error: "Order not found for this offer" }, { status: 404 })
      }
      const existingCourier = await prisma.courierBooking.findFirst({
        where: { orderId: orderExisting.id },
      })
      if (orderExisting.paymentStatus === "PAID" && existingCourier) {
        return NextResponse.json({
          success: true,
          data: {
            order: orderExisting,
            offer,
            courierBooking: existingCourier,
            message: "Order already paid",
          },
        })
      }

      await prisma.$transaction((tx) =>
        applyAutoPartsCourierPaidSettlement(tx, {
          orderId: orderExisting.id,
          orderNumber: orderExisting.orderNumber,
          customerId: user.id,
          customerName: user.name,
          customerPhone: user.phone || null,
          vendorUserId: offer.vendorId,
          partName: offer.request.partName,
          partPrice: offer.price,
          partRequestId: offer.requestId,
          vendorOfferId: offer.id,
          address: {
            latitude: address.latitude,
            longitude: address.longitude,
            street: address.street,
            city: address.city,
            state: address.state,
          },
          vendorProfile: {
            latitude: vp.latitude as number,
            longitude: vp.longitude as number,
            address: vp.address,
          },
          paymentData: paymentData as Record<string, unknown>,
          paymentMethod,
          courierRideTypeId,
          deliveryFee,
        })
      )

      const orderPaid = await prisma.order.findUnique({
        where: { id: orderExisting.id },
        include: {
          orderItems: true,
          address: true,
          vendor: {
            select: {
              name: true,
              vendorProfile: { select: { businessName: true } },
            },
          },
        },
      })
      const courierAfter = await prisma.courierBooking.findFirst({
        where: { orderId: orderExisting.id },
      })
      const socketEarly = getGlobalSocketServer()
      socketEarly.emitAutoPartsRequestRoom(offer.requestId, {
        type: "courier_payment_completed",
        requestId: offer.requestId,
        orderId: orderExisting.id,
      })
      socketEarly.sendNotificationToUser(user.id, {
        type: "notification",
        title: "Courier booking created",
        message: courierAfter
          ? `Your parts will be delivered. Booking #${courierAfter.bookingNumber}`
          : "Delivery scheduled",
        orderId: orderExisting.id,
      })
      return NextResponse.json({
        success: true,
        data: {
          order: orderPaid,
          offer,
          courierBooking: courierAfter,
          message: `Order #${orderExisting.orderNumber} paid and courier booked.`,
        },
      })
    }

    if (offer.status !== "PENDING") {
      if (offer.status === "ACCEPTED" && !needsMechanic && !paymentOk) {
        return NextResponse.json(
          {
            error: "Offer already accepted. Complete payment to schedule delivery.",
            code: "PAYMENT_REQUIRED",
          },
          { status: 200 }
        )
      }
      return NextResponse.json({ error: "Offer is no longer available" }, { status: 400 })
    }

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Update offer status to ACCEPTED
      await tx.partOffer.update({
        where: { id: offerId },
        data: { status: "ACCEPTED" }
      })

      // Update request status to ACCEPTED (not CLOSED - will be closed after payment/mechanical work is complete)
      await tx.partRequest.update({
        where: { id: offer.requestId },
        data: { status: "ACCEPTED" }
      })

      // Reject all other pending offers for this request
      await tx.partOffer.updateMany({
        where: {
          requestId: offer.requestId,
          id: { not: offerId },
          status: "PENDING"
        },
        data: { status: "REJECTED" }
      })

      // Find existing order linked to this part request
      const existingOrder = await tx.order.findFirst({
        where: {
          module: "AUTO_PARTS",
          customerId: user.id,
          partRequestId: offer.requestId, // Use partRequestId to find the order
        } as any,
        include: {
          orderItems: true,
          address: true,
          vendor: {
            select: {
              name: true,
              vendorProfile: {
                select: {
                  businessName: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      let order
      if (existingOrder) {
        // Update existing order
        order = await tx.order.update({
          where: { id: existingOrder.id },
            data: {
            vendorId: offer.vendorId,
            addressId: addressId || existingOrder.addressId,
            partRequestId: offer.requestId,
            status: "PENDING",
            subtotal: partPrice,
            total: partPrice,
            notes: notes || `Accepted offer for ${requestData.partName}. ${needsMechanic ? 'Waiting for mechanic offers.' : ''}`,
            metadata: {
              ...((existingOrder as any).metadata as object | undefined),
              partRequestId: offer.requestId,
              vendorOfferId: offer.id,
              requestId: offer.requestId,
              offerId: offer.id,
            },
          } as any,
          include: {
            orderItems: true,
            address: true,
            vendor: {
              select: {
                name: true,
                vendorProfile: {
                  select: {
                    businessName: true
                  }
                }
              }
            }
          }
        })

        // Delete existing placeholder items and create new ones
        await tx.orderItem.deleteMany({
          where: { orderId: order.id },
        })

        // Create order item
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: offer.partId || '',
            productType: "AUTO_PART",
            productName: offer.request.partName,
            quantity: 1,
            unitPrice: partPrice,
            totalPrice: partPrice,
            notes: offer.description || '',
          },
        })

        // Update order tracking
        await tx.orderTracking.create({
          data: {
            orderId: order.id,
            status: "PENDING",
            notes: needsMechanic 
              ? "Vendor offer accepted. Waiting for mechanic offers." 
              : "Order placed from accepted offer",
          },
        })

        // Reload order with items
        order = await tx.order.findUnique({
          where: { id: order.id },
          include: {
            orderItems: true,
            address: true,
            vendor: {
              select: {
                name: true,
                vendorProfile: {
                  select: {
                    businessName: true
                  }
                }
              }
            }
          }
        })
      } else {
        // Create new order if not found (fallback)
      const orderNumber = generateOrderNumber()
        order = await tx.order.create({
        data: {
          orderNumber,
          customerId: user.id,
          vendorId: offer.vendorId,
          addressId: addressId || null,
          module: "AUTO_PARTS",
            partRequestId: offer.requestId,
            status: "PENDING",
            subtotal: partPrice,
          deliveryFee: 0,
            serviceFee: 0,
          tax: 0,
          discount: 0,
            total: partPrice,
            vendorCommission: 0,
            platformCommission: 0,
            paymentStatus: "PENDING",
            paymentMethod: null,
            notes: notes || `Accepted offer for ${requestData.partName}. ${needsMechanic ? 'Waiting for mechanic offers.' : ''}`,
            metadata: {
              partRequestId: offer.requestId,
              vendorOfferId: offer.id,
              requestId: offer.requestId,
              offerId: offer.id,
            },
          orderItems: {
            create: {
              productId: offer.partId || '',
              productType: "AUTO_PART",
                productName: requestData.partName,
              quantity: 1,
              unitPrice: partPrice,
              totalPrice: partPrice,
                notes: offer.description || '',
              },
          },
          orderTracking: {
            create: {
                status: "PENDING",
              notes: needsMechanic 
                ? "Vendor offer accepted. Waiting for mechanic offers." 
                : "Order placed from accepted offer",
              },
        },
          } as any,
        include: {
          orderItems: true,
          address: true,
          vendor: {
            select: {
              name: true,
              vendorProfile: {
                select: {
                  businessName: true
                }
              }
            }
          }
        }
      })
      }

      let courierBooking: any = null
      if (
        !needsMechanic &&
        isPaymentSucceeded(paymentData) &&
        address &&
        offer.vendor.vendorProfile?.latitude &&
        offer.vendor.vendorProfile?.longitude
      ) {
        const vp = offer.vendor.vendorProfile
        const { courierBooking: cb } = await applyAutoPartsCourierPaidSettlement(tx, {
          orderId: order!.id,
          orderNumber: order!.orderNumber,
          customerId: user.id,
          customerName: user.name,
          customerPhone: user.phone || null,
          vendorUserId: offer.vendorId,
          partName: offer.request.partName,
          partPrice,
          partRequestId: offer.requestId,
          vendorOfferId: offer.id,
          address: {
            latitude: address.latitude,
            longitude: address.longitude,
            street: address.street,
            city: address.city,
            state: address.state,
          },
          vendorProfile: {
            latitude: vp.latitude!,
            longitude: vp.longitude!,
            address: vp.address,
          },
          paymentData: paymentData as Record<string, unknown>,
          paymentMethod,
          courierRideTypeId,
          deliveryFee,
        })
        courierBooking = cb
      }

      return { order, offer, courierBooking }
    })

    getGlobalSocketServer().emitAutoPartsRequestRoom(offer.requestId, {
      type: "vendor_offer_accepted",
      requestId: offer.requestId,
      orderId: result.order.id,
      needsMechanic,
    })

    // Send notifications
    const socketServer = getGlobalSocketServer()
    const { NotificationBridge } = await import("@/lib/notification-bridge")
    
    // Notify vendor
    if (needsMechanic) {
      // If mechanic is needed, notify vendor that offer is accepted and waiting for mechanic
      await NotificationBridge.sendNotification({
        userId: offer.vendorId,
        title: 'Offer Accepted - Waiting for Mechanic',
        message: `Your offer for ${offer.request.partName} has been accepted. The customer is now selecting a mechanic. You'll be notified when a mechanic is assigned to pick up the parts.`,
        type: 'VENDOR_OFFER_ACCEPTED',
        module: 'AUTO_PARTS',
        actionUrl: `/auto-parts/orders/${result.order.id}`,
        data: {
          actionType: 'navigate',
          screen: 'AutoPartsVendorOrderDetails',
          params: [
            { name: 'orderId', value: result.order.id },
          ],
          orderNumber: result.order.orderNumber,
          status: 'WAITING_MECHANIC',
        }
      })
    } else {
      // If no mechanic needed, notify vendor that order is ready
      await NotificationBridge.sendNotification({
        userId: offer.vendorId,
        title: 'Offer Accepted',
        message: `Your offer for ${requestData.partName} has been accepted. Order #${result.order.orderNumber}`,
        type: 'VENDOR_OFFER_ACCEPTED',
        module: 'AUTO_PARTS',
        actionUrl: `/auto-parts/orders/${result.order.id}`,
        data: {
          actionType: 'navigate',
          screen: 'AutoPartsVendorOrderDetails',
          params: [
            { name: 'orderId', value: result.order.id },
          ],
          orderNumber: result.order.orderNumber,
        }
      })
    }
    
    socketServer?.sendNotificationToUser(offer.vendorId, {
      type: 'notification',
      title: needsMechanic ? 'Offer Accepted - Waiting for Mechanic' : 'Offer Accepted',
      message: needsMechanic 
        ? `Your offer has been accepted. Waiting for customer to select a mechanic.`
        : `Your offer for ${requestData.partName} has been accepted`,
      orderId: result.order.id,
      orderNumber: result.order.orderNumber
    })

    // Notify about courier booking if created
    if (result.courierBooking) {
      socketServer?.sendNotificationToUser(user.id, {
        type: 'notification',
        title: 'Courier Booking Created',
        message: `Your parts will be delivered via courier. Booking #${result.courierBooking.bookingNumber}`,
        orderId: result.order.id
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        order: result.order,
        offer: result.offer,
        courierBooking: result.courierBooking,
        message: needsMechanic 
          ? `Offer accepted. Order #${result.order.orderNumber} is waiting for mechanic offers.`
          : paymentOk
            ? `Order #${result.order.orderNumber} placed successfully. Payment processed and courier booking created.`
            : `Order #${result.order.orderNumber} placed successfully. Please proceed to payment.`
      }
    })

  } catch (error: any) {
    console.error("Accept offer error:", error)
    return NextResponse.json(
      { error: "Failed to accept offer", details: error.message },
      { status: 500 }
    )
  }
}

