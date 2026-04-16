import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { awardLoyaltyPoints, redeemLoyaltyPoints } from "@/lib/loyalty-service"
import { calculateRouteAndFee, type PickupPoint, type DropoffPoint } from "@/lib/multi-pickup-route.service"
import { saveRouteToMultiplePickups } from "@/lib/multi-pickup-route-helper"
import { createSplitPayments } from "@/lib/payment-service"
import { createOrderCompletionWalletTransactions } from "@/lib/wallet-transaction-service"
import { createPendingVendorWalletsForCourierOrder } from "@/lib/create-pending-vendor-wallet-for-courier-order"
import { checkoutPlatformFeeAmount, checkoutVendorCommissionAmount } from "@/lib/commission-service"
import {
  ensurePlatformFeeReportingVendorCommissions,
  ensureVendorCommissionRecordsForOrderTree,
  splitAmountByWeights,
} from "@/lib/order-vendor-platform-fee-record"
import { getDrivingDistanceKmSmart } from "@/lib/driving-distance-smart"

function generateOrderNumber(): string {
  return `GRC-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
}

function generateBookingNumber(): string {
  return `CB-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
}

async function resolveCoordinates(address: string, apiKey: string): Promise<{ latitude: number; longitude: number }> {
  const params = new URLSearchParams({ address, key: apiKey })
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`)
  if (!res.ok) throw new Error('Geocoding failed')
  const data = await res.json()
  if (data.status !== 'OK' || !data.results?.[0]) throw new Error('Address not found')
  const loc = data.results[0].geometry.location
  return { latitude: loc.lat, longitude: loc.lng }
}

async function getDrivingDistance(
  oLat: number, oLng: number,
  dLat: number, dLng: number,
  apiKey: string
): Promise<{ distance: number; duration: number } | null> {
  try {
    const r = await getDrivingDistanceKmSmart(oLat, oLng, dLat, dLng, apiKey)
    return { distance: r.distance, duration: r.durationMinutes }
  } catch {
    return null
  }
}

function calculateFare(rideType: { basePrice?: number; pricePerKm?: number; pricePerMinute?: number }, distanceKm: number, durationMin: number): number {
  const base = rideType.basePrice ?? 0
  const perKm = rideType.pricePerKm ?? 0
  const perMin = rideType.pricePerMinute ?? 0
  return Math.round((base + perKm * distanceKm + perMin * durationMin) * 100) / 100
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { items, addressId, paymentMethod, paymentData, notes, calculatedAmounts, loyaltyPointsRedeemed, promoCodeId } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 })
    }
    if (!addressId) {
      return NextResponse.json({ error: "Delivery address is required" }, { status: 400 })
    }

    const address = await prisma.address.findUnique({
      where: { id: addressId, userId: user.id },
    })
    if (!address) return NextResponse.json({ error: "Address not found" }, { status: 404 })

    let dropLat = address.latitude
    let dropLng = address.longitude
    if (dropLat == null || dropLng == null) {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY
      if (!apiKey) return NextResponse.json({ error: "Geocoding service unavailable" }, { status: 500 })
      const coords = await resolveCoordinates(
        `${address.street}, ${address.city}, ${address.state}`,
        apiKey
      )
      dropLat = coords.latitude
      dropLng = coords.longitude
      await prisma.address.update({
        where: { id: addressId },
        data: { latitude: dropLat, longitude: dropLng },
      })
    }

    const storeIdsSet = new Set(items.map((i: { storeId?: string; restaurantId?: string }) => i.storeId ?? i.restaurantId).filter(Boolean))
    const storeIds = Array.from(storeIdsSet) as string[]
    if (storeIds.length === 0) {
      return NextResponse.json({ error: "Each item must have storeId" }, { status: 400 })
    }

    // Fetch all stores
    const stores = await prisma.groceryStore.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, storeName: true, address: true, latitude: true, longitude: true, userId: true },
    })
    if (stores.length !== storeIds.length) {
      return NextResponse.json({ error: "One or more stores not found" }, { status: 404 })
    }

    const isMultiStore = storeIds.length > 1
    const primaryStore = stores[0] // Use first store as primary vendor

    let subtotal = 0
    for (const it of items) {
      subtotal += (it.price ?? 0) * (it.quantity ?? 1)
    }

    // --- Promo code (optional) ---
    let promoDiscount = 0
    let validatedPromo: { id: string } | null = null
    if (promoCodeId) {
      const promo = await prisma.promoCode.findUnique({ where: { id: String(promoCodeId) } })
      const now = new Date()
      if (
        promo &&
        promo.isActive &&
        now >= promo.startsAt &&
        now <= promo.expiresAt &&
        (!promo.usageLimit || promo.usedCount < promo.usageLimit) &&
        (!promo.minOrderAmount || subtotal >= promo.minOrderAmount)
      ) {
        const modules = (promo.modules as any) as string[] | null
        if (!modules || modules.length === 0 || modules.includes("GROCERY")) {
          if (promo.type === "PERCENTAGE") {
            promoDiscount = subtotal * (promo.value / 100)
            if (promo.maxDiscount && promoDiscount > promo.maxDiscount) promoDiscount = promo.maxDiscount
          } else if (promo.type === "FIXED_AMOUNT") {
            promoDiscount = promo.value
          }
          promoDiscount = Math.max(0, Math.min(subtotal, promoDiscount))
          promoDiscount = Math.round(promoDiscount * 100) / 100
          if (promoDiscount > 0) validatedPromo = { id: promo.id }
        }
      }
    }

    const discountedSubtotalGrocery = Math.max(0, subtotal - promoDiscount)
    const platformCommission = await checkoutPlatformFeeAmount("GROCERY", discountedSubtotalGrocery)
    const vendorCommissionTotal = await checkoutVendorCommissionAmount("GROCERY", discountedSubtotalGrocery)

    const rideType = await prisma.rideType.findFirst({
      where: { category: "COURIER", vehicleType: "MOTORCYCLE", isActive: true },
    })
    if (!rideType) return NextResponse.json({ error: "Courier service not available" }, { status: 503 })

    const apiKey = process.env.GOOGLE_MAPS_API_KEY

    // Ensure all stores have coordinates
    for (const store of stores) {
      if (store.latitude == null || store.longitude == null) {
        if (!apiKey) return NextResponse.json({ error: "Geocoding service unavailable" }, { status: 500 })
        const coords = await resolveCoordinates(store.address, apiKey)
        await prisma.groceryStore.update({
          where: { id: store.id },
          data: { latitude: coords.latitude, longitude: coords.longitude },
        })
        store.latitude = coords.latitude
        store.longitude = coords.longitude
      }
    }

    // Calculate route and delivery fee
    let distance = calculatedAmounts?.distance ?? 5
    let estimatedTime = calculatedAmounts?.estimatedArrivalMinutes ?? 30
    let deliveryFee = 0
    let routeData: any = null

    if (isMultiStore) {
      // Multi-store: Use route optimization service
      const pickupPoints: PickupPoint[] = stores.map(store => ({
        id: store.id,
        name: store.storeName,
        address: store.address,
        latitude: store.latitude!,
        longitude: store.longitude!,
        module: 'GROCERY',
        storeType: 'GROCERY_STORE',
      }))

      const dropoffPoint: DropoffPoint = {
        id: address.id,
        address: `${address.street}, ${address.city}, ${address.state}`,
        latitude: dropLat!,
        longitude: dropLng!,
      }

      if (apiKey) {
        const routeResult = await calculateRouteAndFee(
          pickupPoints,
          dropoffPoint,
          {
            basePrice: rideType.basePrice ?? 0,
            pricePerKm: rideType.pricePerKm ?? 0,
            pricePerMinute: rideType.pricePerMinute ?? 0,
          },
          apiKey
        )

        if (routeResult.isValid && routeResult.route) {
          routeData = routeResult.route
          distance = routeResult.route.totalDistance
          estimatedTime = routeResult.route.estimatedDeliveryTime
          deliveryFee = routeResult.deliveryFee.totalFee
        } else {
          // Fallback to simple calculation
          const firstStore = stores[0]
          const distData = await getDrivingDistance(firstStore.latitude!, firstStore.longitude!, dropLat!, dropLng!, apiKey)
          if (distData) {
            distance = distData.distance
            estimatedTime = Math.ceil(distData.duration)
          }
          deliveryFee = calculateFare(rideType, distance, estimatedTime)
        }
      } else {
        // No API key - use fallback
        deliveryFee = calculateFare(rideType, distance, estimatedTime)
      }
    } else {
      // Single store: Use existing simple calculation
      const store = stores[0]
      if (apiKey) {
        const distData = await getDrivingDistance(store.latitude!, store.longitude!, dropLat!, dropLng!, apiKey)
        if (distData) {
          distance = distData.distance
          estimatedTime = Math.ceil(distData.duration)
          deliveryFee = calculateFare(rideType, distance, estimatedTime)
        } else {
          deliveryFee = calculateFare(rideType, distance, estimatedTime)
        }
      } else {
        deliveryFee = calculateFare(rideType, distance, estimatedTime)
      }
    }

    // Calculate total
    const total = Math.max(0, subtotal - promoDiscount) + deliveryFee + platformCommission

    // Group items by store for multi-store orders
    const itemsByStore: Record<string, typeof items> = {}
    if (isMultiStore) {
      for (const item of items) {
        const storeId = item.storeId
        if (!itemsByStore[storeId]) {
          itemsByStore[storeId] = []
        }
        itemsByStore[storeId].push(item)
      }
    }

    let parentOrder: any = null
    const childOrders: any[] = []

    if (isMultiStore) {
      // Create child orders for each store
      // Distribute promo discount across child orders by subtotal share
      let remainingDiscount = promoDiscount
      const discountByStore: Record<string, number> = {}
      for (let i = 0; i < storeIds.length; i++) {
        const storeId = storeIds[i]
        const storeItems = itemsByStore[storeId] || []
        let storeSubtotal = 0
        for (const it of storeItems) storeSubtotal += (it.price ?? 0) * (it.quantity ?? 1)
        const share = subtotal > 0 ? storeSubtotal / subtotal : 0
        const d = i === storeIds.length - 1 ? remainingDiscount : Math.round(promoDiscount * share * 100) / 100
        discountByStore[storeId] = Math.max(0, d)
        remainingDiscount = Math.max(0, Math.round((remainingDiscount - discountByStore[storeId]) * 100) / 100)
      }

      const storeNets = storeIds.map((sid) => {
        const storeItemsN = itemsByStore[sid] || []
        let s = 0
        for (const it of storeItemsN) s += (it.price ?? 0) * (it.quantity ?? 1)
        return Math.max(0, s - (discountByStore[sid] || 0))
      })
      const groceryPlatformParts = splitAmountByWeights(platformCommission, storeNets)
      const groceryVendorParts = splitAmountByWeights(vendorCommissionTotal, storeNets)

      for (let si = 0; si < storeIds.length; si++) {
        const storeId = storeIds[si]
        const storeItems = itemsByStore[storeId] || []
        const store = stores.find(s => s.id === storeId)!
        
        // Calculate subtotal for this store
        let storeSubtotal = 0
        for (const it of storeItems) {
          storeSubtotal += (it.price ?? 0) * (it.quantity ?? 1)
        }

        const storePlatformCommission = groceryPlatformParts[si] ?? 0
        const storeVendorCommission = groceryVendorParts[si] ?? 0

        // Calculate delivery fee proportion (distribute based on subtotal ratio)
        const storeDeliveryFee = (storeSubtotal / subtotal) * deliveryFee
        const storeDiscount = discountByStore[storeId] || 0
        const storeTotal = Math.max(0, storeSubtotal - storeDiscount) + storeDeliveryFee + storePlatformCommission

        const childOrderNumber = generateOrderNumber()
        const childOrder = await prisma.order.create({
          data: {
            orderNumber: childOrderNumber,
            customerId: user.id,
            vendorId: store.userId,
            addressId,
            module: "GROCERY",
            status: "PENDING",
            subtotal: storeSubtotal,
            deliveryFee: storeDeliveryFee,
            serviceFee: 0,
            tax: 0,
            discount: storeDiscount,
            total: storeTotal as number,
            platformCommission: storePlatformCommission,
            vendorCommission: storeVendorCommission,
            paymentStatus: paymentData?.status === 'succeeded' ? 'PAID' : 'PENDING',
            paymentMethod: paymentMethod || 'CARD',
            notes: notes ?? null,
            groceryId: store.id,
            isChildOrder: true as any,
            orderItems: {
              create: storeItems.map((it: { productId: string; id?: string; name: string; price: number; quantity: number; notes?: string; customizations?: unknown }) => {
                const c = (it.customizations as any) || undefined
                const hasOffer = !!(c && String(c.kiloOfferId || "").trim())
                const merged = hasOffer ? { ...c, kiloSaleSource: "SPECIAL_OFFER" } : c
                return {
                productId: it.productId ?? it.id,
                productType: "GROCERY_PRODUCT",
                productName: it.name,
                quantity: it.quantity ?? 1,
                unitPrice: it.price,
                totalPrice: (it.price ?? 0) * (it.quantity ?? 1),
                notes: it.notes ?? null,
                  customizations: merged ?? undefined,
                }
              }),
            },
            orderTracking: {
              create: { status: "PENDING", notes: "Order placed successfully" },
            },
          },
          include: { orderItems: true, address: true },
        })

        childOrders.push(childOrder)
      }

      // Create parent order that aggregates all child orders
      const parentOrderNumber = generateOrderNumber()
      parentOrder = await prisma.order.create({
        data: {
          orderNumber: parentOrderNumber,
          customerId: user.id,
          vendorId: null, // No single vendor for multi-store orders
          addressId,
          module: "GROCERY",
          status: "PENDING",
          subtotal,
          deliveryFee,
          serviceFee: 0,
          tax: 0,
          discount: promoDiscount,
          total: total as number,
          platformCommission,
          vendorCommission: vendorCommissionTotal,
          paymentStatus: paymentData?.status === 'succeeded' ? 'PAID' : 'PENDING',
          paymentMethod: paymentMethod || 'CARD',
          notes: notes ?? `Multi-store order from ${storeIds.length} stores`,
          groceryId: null,
          isChildOrder: false as any,
          childId: null as any,
          orderItems: {
            create: items.map((it: { productId: string; id?: string; name: string; price: number; quantity: number; notes?: string; customizations?: unknown }) => {
              const c = (it.customizations as any) || undefined
              const hasOffer = !!(c && String(c.kiloOfferId || "").trim())
              const merged = hasOffer ? { ...c, kiloSaleSource: "SPECIAL_OFFER" } : c
              return {
              productId: it.productId ?? it.id,
              productType: "GROCERY_PRODUCT",
              productName: it.name,
              quantity: it.quantity ?? 1,
              unitPrice: it.price,
              totalPrice: (it.price ?? 0) * (it.quantity ?? 1),
              notes: it.notes ?? null,
                customizations: merged ?? undefined,
              }
            }),
          },
          orderTracking: {
            create: { status: "PENDING", notes: "Order placed successfully" },
          },
        },
        include: { orderItems: true, address: true },
      })

      // Link child orders to parent order
      await prisma.order.updateMany({
        where: {
          id: { in: childOrders.map(co => co.id) },
        },
        data: {
          childId: parentOrder.id as any,
        },
      })
    } else {
      // Single store: Create regular order (no parent-child relationship)
      const orderNumber = generateOrderNumber()
      parentOrder = await prisma.order.create({
        data: {
          orderNumber,
          customerId: user.id,
          vendorId: primaryStore.userId,
          addressId,
          module: "GROCERY",
          status: "PENDING",
          subtotal,
          deliveryFee,
          serviceFee: 0,
          tax: 0,
          discount: promoDiscount,
          total: total as number,
          platformCommission,
          vendorCommission: vendorCommissionTotal,
          paymentStatus: paymentData?.status === 'succeeded' ? 'PAID' : 'PENDING',
          paymentMethod: paymentMethod || 'CARD',
          notes: notes ?? null,
          groceryId: primaryStore.id,
          isChildOrder: false as any,
          childId: null as any,
          orderItems: {
            create: items.map((it: { productId: string; id?: string; name: string; price: number; quantity: number; notes?: string; customizations?: unknown }) => {
              const c = (it.customizations as any) || undefined
              const hasOffer = !!(c && String(c.kiloOfferId || "").trim())
              const merged = hasOffer ? { ...c, kiloSaleSource: "SPECIAL_OFFER" } : c
              return {
              productId: it.productId ?? it.id,
              productType: "GROCERY_PRODUCT",
              productName: it.name,
              quantity: it.quantity ?? 1,
              unitPrice: it.price,
              totalPrice: (it.price ?? 0) * (it.quantity ?? 1),
              notes: it.notes ?? null,
                customizations: merged ?? undefined,
              }
            }),
          },
          orderTracking: {
            create: { status: "PENDING", notes: "Order placed successfully" },
          },
        },
        include: { orderItems: true, address: true },
      })
    }

    const order = parentOrder

    // Record promo usage (on parent order)
    if (validatedPromo && promoDiscount > 0 && order?.id) {
      try {
        await prisma.$transaction([
          prisma.promoCode.update({ where: { id: validatedPromo.id }, data: { usedCount: { increment: 1 } } }),
          prisma.promoCodeUsage.create({
            data: { promoCodeId: validatedPromo.id, orderId: order.id, userId: user.id, discount: promoDiscount },
          }),
        ])
      } catch (e) {
        console.error("Promo code usage record failed:", e)
      }
    }

    // Save route data for multi-store orders (link to parent order)
    if (isMultiStore && routeData) {
      try {
        await saveRouteToMultiplePickups(order.id, routeData, 'GROCERY')
      } catch (error) {
        console.error('Error saving route data:', error)
        // Don't fail the order if route saving fails
      }
    }

    if (loyaltyPointsRedeemed && loyaltyPointsRedeemed > 0) {
      try {
        await redeemLoyaltyPoints(
          user.id,
          loyaltyPointsRedeemed,
          order.id,
          `Points redeemed for grocery order #${order.orderNumber}`
        )
      } catch (e) {
        console.error("Loyalty redeem error:", e)
      }
    }

    // Create courier booking first (needed for payment references)
    const bookingNumber = generateBookingNumber()
    const primaryStoreForBooking = stores[0]
    const courierBooking = await prisma.courierBooking.create({
      data: {
        bookingNumber,
        customerId: user.id,
        orderId: order.id,
        rideTypeId: rideType.id,
        pickupAddress: isMultiStore 
          ? `Multiple stores: ${stores.map(s => s.storeName).join(', ')}`
          : primaryStoreForBooking.address,
        pickupLatitude: primaryStoreForBooking.latitude!,
        pickupLongitude: primaryStoreForBooking.longitude!,
        dropAddress: `${address.street}, ${address.city}, ${address.state}`,
        dropLatitude: dropLat!,
        dropLongitude: dropLng!,
        distance,
        estimatedTime,
        fare: deliveryFee,
        status: "REQUESTED",
        paymentStatus: paymentData?.status === 'succeeded' ? 'PAID' : 'PENDING',
        paymentMethod: paymentMethod || 'CARD',
        packageType: "Grocery",
        module: "GROCERY",
        notes: notes || `Grocery order: ${items.length} items${isMultiStore ? ` from ${stores.length} stores` : ''}`,
        recipientName: user.name ?? undefined,
        recipientPhone: user.phone ?? '',
      },
    })

    // Link MultiplePickup records to courier booking if multi-store
    if (isMultiStore) {
      await prisma.multiplePickup.updateMany({
        where: { orderId: order.id },
        data: { courierBookingId: courierBooking.id },
      })
    }

    await prisma.courierTracking.create({
      data: {
        bookingId: courierBooking.id,
        status: "REQUESTED",
        notes: "Booking created, looking for nearby riders",
      },
    })

    try {
      await createPendingVendorWalletsForCourierOrder({
        parentOrderId: order.id,
        courierBookingId: courierBooking.id,
        orderNumberHint: order.orderNumber,
      })
    } catch (wErr) {
      console.error("Grocery pending vendor wallets:", wErr)
    }

    try {
      await ensureVendorCommissionRecordsForOrderTree(order.id)
      await ensurePlatformFeeReportingVendorCommissions(order.id)
    } catch (pcErr) {
      console.error("Grocery vendor commission record:", pcErr)
    }

    // Create split payments: one for each vendor order + one for rider
    // Use currency from PaymentScreen (paymentData.currency) or default to NGN
    const paymentCurrency = paymentData?.currency || "NGN"

    if (paymentData && paymentData.status === "succeeded") {
      try {
        const vendorPayments = isMultiStore
          ? childOrders.map(childOrder => ({
              vendorId: childOrder.vendorId!,
              orderId: childOrder.id,
              amount: childOrder.total,
            }))
          : [{
              vendorId: primaryStore.userId,
              orderId: order.id,
              amount: order.total,
            }]

        const riderPayment = {
          riderId: '', // Will be set when rider accepts
          courierBookingId: courierBooking.id,
          amount: deliveryFee,
        }

        const splitPaymentResult = await createSplitPayments({
          userId: user.id,
          currency: paymentCurrency,
          status: 'PAID',
          gateway: paymentData.gateway || 'STRIPE',
          gatewayTransactionId: paymentData.id ?? paymentData.transactionId ?? undefined,
          description: `Payment for grocery order ${order.orderNumber}`,
          metadata: {
            ...(paymentData as object),
            orderNumber: order.orderNumber,
            isMultiStore,
            parentOrderId: order.id,
          },
          vendorPayments,
          riderPayment,
        })
        
        console.log(`Created payment group ${splitPaymentResult.paymentGroupId} with ${splitPaymentResult.vendorPayments.length} vendor payments and ${splitPaymentResult.riderPayment ? 1 : 0} rider payment`)

        // Create wallet transactions (pending) for vendors and rider
        // Vendor transactions
        for (const vendorPayment of vendorPayments) {
          const co = isMultiStore ? childOrders.find((c) => c.id === vendorPayment.orderId) : order
          // Special offers: if PLATFORM funded, vendor should not lose that discount.
          const lineItems = (co?.orderItems || []) as any[]
          let platformDiscount = 0
          for (const li of lineItems) {
            const cust = li?.customizations as any
            const offerId = String(cust?.kiloOfferId || "").trim()
            if (!offerId) continue
            const fundedBy = String(cust?.kiloOfferDiscountFundedBy || "").toUpperCase()
            if (fundedBy !== "PLATFORM") continue
            const originalUnit = Number(cust?.kiloOfferOriginalUnitPrice || 0)
            const unit = Number(li?.unitPrice || 0)
            const qty = Number(li?.quantity || 0)
            if (!Number.isFinite(originalUnit) || !Number.isFinite(unit) || !Number.isFinite(qty)) continue
            platformDiscount += Math.max(0, (originalUnit - unit) * qty)
          }

          const net = Math.max(0, (co?.subtotal ?? 0) - (co?.discount ?? 0) + platformDiscount)
          const vendorAmount = Math.max(0, net - (co?.vendorCommission ?? 0))
          await createOrderCompletionWalletTransactions({
            vendorId: vendorPayment.vendorId,
            vendorAmount,
            orderId: vendorPayment.orderId,
            courierBookingId: courierBooking.id,
            description: `Payment for grocery order ${order.orderNumber}`,
          })
        }

        // Rider transaction will be created when rider accepts the booking
      } catch (error) {
        console.error('Error creating split payments:', error)
        // Fallback to single payment if split fails
        // await prisma.payment.create({
        //   data: {
        //     userId: user.id,
        //     orderId: order.id,
        //     amount: total,
        //     currency: paymentCurrency,
        //     status: 'PAID',
        //     gateway: paymentData.gateway || 'STRIPE',
        //     gatewayTransactionId: paymentData.id ?? paymentData.transactionId ?? undefined,
        //     metadata: {
        //       ...(paymentData as object),
        //       orderNumber: order.orderNumber,
        //       isMultiStore,
        //     },
        //   },
        // }).catch(console.error)
      }
    } else if (paymentData) {
      // Payment pending - create single payment record
      // await prisma.payment.create({
      //   data: {
      //     userId: user.id,
      //     orderId: order.id,
      //     amount: total,
      //     currency: paymentCurrency,
      //     status: 'PENDING',
      //     gateway: paymentData.gateway || 'STRIPE',
      //     gatewayTransactionId: paymentData.id ?? paymentData.transactionId ?? undefined,
      //     metadata: {
      //       ...(paymentData as object),
      //       orderNumber: order.orderNumber,
      //       isMultiStore,
      //     },
      //   },
      // }).catch(console.error)
    }

    if (paymentData?.status === 'succeeded' || paymentMethod === 'WALLET') {
      try {
        await awardLoyaltyPoints({
          userId: user.id,
          orderId: order.id,
          module: "GROCERY",
          orderAmount: total,
          reason: `Points earned from grocery order #${order.orderNumber}`,
        })
      } catch (e) {
        console.error("Loyalty award error:", e)
      }
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        deliveryFee: order.deliveryFee,
        platformCommission: order.platformCommission,
        isChildOrder: order.isChildOrder,
        childId: order.childId,
        childOrders: isMultiStore ? childOrders.map(co => ({
          id: co.id,
          orderNumber: co.orderNumber,
          vendorId: co.vendorId,
          total: co.total,
        })) : undefined,
      },
      booking: {
        id: courierBooking.id,
        bookingNumber: courierBooking.bookingNumber,
        status: courierBooking.status,
        distance: courierBooking.distance,
        fare: courierBooking.fare,
        estimatedTime: courierBooking.estimatedTime,
        pickupAddress: courierBooking.pickupAddress,
        dropAddress: courierBooking.dropAddress,
        pickupLatitude: courierBooking.pickupLatitude,
        pickupLongitude: courierBooking.pickupLongitude,
        dropLatitude: courierBooking.dropLatitude,
        dropLongitude: courierBooking.dropLongitude,
      },
    })
  } catch (error) {
    console.error("Grocery checkout error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Checkout failed" },
      { status: 500 }
    )
  }
}
