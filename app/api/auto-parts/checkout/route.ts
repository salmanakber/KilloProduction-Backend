import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { calculateRouteAndFee, type PickupPoint, type DropoffPoint } from "@/lib/multi-pickup-route.service"
import { saveRouteToMultiplePickups } from "@/lib/multi-pickup-route-helper"
import { createPendingVendorWalletsForCourierOrder } from "@/lib/create-pending-vendor-wallet-for-courier-order"
import { checkoutPlatformFeeAmount, checkoutVendorCommissionAmount } from "@/lib/commission-service"
import {
  ensurePlatformFeeReportingVendorCommissions,
  ensureVendorCommissionRecordsForOrderTree,
  splitAmountByWeights,
} from "@/lib/order-vendor-platform-fee-record"
import { getDrivingDistanceKmSmart } from "@/lib/driving-distance-smart"
import { NotificationBridge } from "@/lib/notification-bridge"
import { applyClientDeliveryChargeIfProvided } from "@/lib/checkout-client-amounts"
import { settlementMerchandiseFromCartLines } from "@/lib/pharmacy-vendor-settlement"
import { buildOrderSpecialOffersMetadata } from "@/lib/order-special-offer-metadata"

function generateOrderNumber(): string {
  return `AP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Helper to resolve coordinates
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

function autoPartsSpecialOfferCustomizations(item: any): Record<string, unknown> | undefined {
  const so = item.specialOffer as
    | {
        offerId?: string
        discountFundedBy?: string
        originalPrice?: number
        discountType?: string
        discountValue?: number
      }
    | undefined
  if (!so?.offerId) return undefined
  const c: Record<string, unknown> = {
    kiloOfferId: String(so.offerId),
    kiloSaleSource: "SPECIAL_OFFER",
  }
  if (so.discountFundedBy) c.kiloOfferDiscountFundedBy = String(so.discountFundedBy)
  if (so.originalPrice != null && Number.isFinite(Number(so.originalPrice))) {
    c.kiloOfferOriginalUnitPrice = Number(so.originalPrice)
  }
  if (so.discountType) c.kiloOfferDiscountType = String(so.discountType)
  if (so.discountValue != null && Number.isFinite(Number(so.discountValue))) {
    c.kiloOfferDiscountValue = Number(so.discountValue)
  }
  return c
}

function mergeAutoPartsItemCustomizations(item: any): Record<string, unknown> | undefined {
  const fromOffer = autoPartsSpecialOfferCustomizations(item)
  const existing = item.customizations as Record<string, unknown> | undefined
  if (fromOffer && existing && typeof existing === "object") {
    return { ...existing, ...fromOffer }
  }
  return fromOffer ?? existing
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { 
      items,
      addressId,
      paymentMethod,
      paymentData,
      calculatedAmounts,
      notes,
      promoCodeId
    } = body

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No items in cart" }, { status: 400 })
    }

    if (!addressId) {
      return NextResponse.json({ error: "Delivery address is required" }, { status: 400 })
    }

    // Get delivery address
    const address = await prisma.address.findUnique({
      where: { id: addressId, userId: user.id }
    })

    if (!address) {
      return NextResponse.json({ error: "Invalid delivery address" }, { status: 404 })
    }

    // Get system settings for currency
    const settings = await prisma.systemSettings.findFirst({
      orderBy: { createdAt: 'desc' }
    })

    // Get coordinates for delivery address
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

    // Group items by storeId (if available) or vendorId
    const itemsByStore: Record<string, typeof items> = {}
    const storeIdsSet = new Set<string>()
    
    for (const item of items) {
      const storeId = item.storeId || item.autoPartsStoreId
      const vendorId = item.vendorId
      
      if (storeId) {
        storeIdsSet.add(storeId)
        if (!itemsByStore[storeId]) {
          itemsByStore[storeId] = []
        }
        itemsByStore[storeId].push(item)
      } else if (vendorId) {
        // If no storeId, use vendorId as key (we'll fetch store by userId)
        storeIdsSet.add(vendorId)
        if (!itemsByStore[vendorId]) {
          itemsByStore[vendorId] = []
        }
        itemsByStore[vendorId].push(item)
      }
    }

    const storeIds = Array.from(storeIdsSet)
    if (storeIds.length === 0) {
      return NextResponse.json({ error: "Each item must have storeId or vendorId" }, { status: 400 })
    }

    // Fetch AutoPartsStore records (by id or userId)
    const stores = await prisma.autoPartsStore.findMany({
      where: {
        OR: [
          { id: { in: storeIds } },
          { userId: { in: storeIds } }
        ]
      },
      select: {
        id: true,
        userId: true,
        storeName: true,
        address: true,
        latitude: true,
        longitude: true,
      },
    })

    if (stores.length === 0) {
      return NextResponse.json({ error: "One or more stores not found" }, { status: 404 })
    }

    // Create store map
    const storeMap: Record<string, typeof stores[0]> = {}
    for (const store of stores) {
      storeMap[store.id] = store
      storeMap[store.userId] = store // Also map by userId
    }

    // Ensure all stores have coordinates
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    for (const store of stores) {
      if (store.latitude == null || store.longitude == null) {
        if (!apiKey) return NextResponse.json({ error: "Geocoding service unavailable" }, { status: 500 })
        const coords = await resolveCoordinates(store.address, apiKey)
        await prisma.autoPartsStore.update({
          where: { id: store.id },
          data: { latitude: coords.latitude, longitude: coords.longitude },
        })
        store.latitude = coords.latitude
        store.longitude = coords.longitude
      }
    }

    const isMultiStore = stores.length > 1
    const primaryStore = stores[0]

    // Calculate subtotal
    let subtotal = 0
    for (const item of items) {
      subtotal += item.quantity * item.price
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
        if (!modules || modules.length === 0 || modules.includes("AUTO_PARTS")) {
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

    const discountedSubtotalAuto = Math.max(0, subtotal - promoDiscount)

    const platformCommission = await checkoutPlatformFeeAmount("AUTO_PARTS", discountedSubtotalAuto)
    const vendorCommissionSubtotalAuto = settlementMerchandiseFromCartLines(
      items,
      subtotal,
      promoDiscount,
    )
    const vendorCommission = await checkoutVendorCommissionAmount(
      "AUTO_PARTS",
      vendorCommissionSubtotalAuto,
    )

    // Get ride type for COURIER with MOTORCYCLE
    const rideType = await prisma.rideType.findFirst({
      where: { category: "COURIER", vehicleType: "MOTORCYCLE", isActive: true },
    })
    if (!rideType) return NextResponse.json({ error: "Courier service not available" }, { status: 503 })

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
        module: 'AUTO_PARTS',
        storeType: 'AUTO_PARTS_STORE',
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

    deliveryFee = applyClientDeliveryChargeIfProvided(calculatedAmounts, deliveryFee)

    // Customer total: items (after promo) + delivery + platform fee
    const total = discountedSubtotalAuto + deliveryFee + platformCommission

    // Get vendor IDs from stores
    const vendorIds = stores.map(s => s.userId).filter(Boolean) as string[]

    // Group items by store for multi-store orders
    const itemsByStoreFinal: Record<string, typeof items> = {}
    if (isMultiStore) {
      for (const item of items) {
        const storeId = item.storeId || item.autoPartsStoreId
        const vendorId = item.vendorId
        const key = storeId || (vendorId && storeMap[vendorId]?.id)
        if (key && storeMap[key]) {
          if (!itemsByStoreFinal[key]) {
            itemsByStoreFinal[key] = []
          }
          itemsByStoreFinal[key].push(item)
        }
      }
    }

    let parentOrder: any = null
    const childOrders: any[] = []

    if (isMultiStore) {
      // Create child orders for each store
      // Distribute promo discount across child orders by subtotal share
      let remainingDiscount = promoDiscount
      const discountByStore: Record<string, number> = {}
      for (let i = 0; i < stores.length; i++) {
        const store = stores[i]
        const storeItems = itemsByStoreFinal[store.id] || []
        let storeSubtotal = 0
        for (const it of storeItems) storeSubtotal += (it.price ?? 0) * (it.quantity ?? 1)
        const share = subtotal > 0 ? storeSubtotal / subtotal : 0
        const d = i === stores.length - 1 ? remainingDiscount : Math.round(promoDiscount * share * 100) / 100
        discountByStore[store.id] = Math.max(0, d)
        remainingDiscount = Math.max(0, Math.round((remainingDiscount - discountByStore[store.id]) * 100) / 100)
      }

      const autoStoreNets = stores.map((st) => {
        const storeItemsN = itemsByStoreFinal[st.id] || []
        let s = 0
        for (const it of storeItemsN) s += (it.price ?? 0) * (it.quantity ?? 1)
        return Math.max(0, s - (discountByStore[st.id] || 0))
      })
      const autoPlatformParts = splitAmountByWeights(platformCommission, autoStoreNets)
      const autoVendorParts = splitAmountByWeights(vendorCommission, autoStoreNets)

      for (let ai = 0; ai < stores.length; ai++) {
        const store = stores[ai]
        const storeItems = itemsByStoreFinal[store.id] || []
        if (storeItems.length === 0) continue
        
        // Calculate subtotal for this store
        let storeSubtotal = 0
        for (const it of storeItems) {
          storeSubtotal += (it.price ?? 0) * (it.quantity ?? 1)
        }

        const storePlatformCommission = autoPlatformParts[ai] ?? 0
        const storeVendorCommission = autoVendorParts[ai] ?? 0

        // Calculate delivery fee proportion (distribute based on subtotal ratio)
        const storeDeliveryFee = (storeSubtotal / subtotal) * deliveryFee
        const storeDiscount = discountByStore[store.id] || 0
        const storeTotal = Math.max(0, storeSubtotal - storeDiscount) + storeDeliveryFee + storePlatformCommission

        const childOrderNumber = generateOrderNumber()
        const apChildOfferMeta = buildOrderSpecialOffersMetadata(storeItems as Record<string, unknown>[])
        const childOrder = await prisma.order.create({
          data: {
            orderNumber: childOrderNumber,
            customerId: user.id,
            vendorId: store.userId,
            addressId,
            module: "AUTO_PARTS",
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
            isChildOrder: true as any,
            ...(apChildOfferMeta ? { metadata: { specialOffers: apChildOfferMeta } as object } : {}),
            orderItems: {
              create: storeItems.map((it: any) => {
                const c = mergeAutoPartsItemCustomizations(it)
                const hasOffer = c && String(c.kiloOfferId || "").trim()
                const merged = hasOffer ? { ...c, kiloSaleSource: "SPECIAL_OFFER" } : c
                return {
                  productId: it.productId || it.partId || '',
                  productType: "AUTO_PART",
                  productName: it.name,
                  quantity: it.quantity ?? 1,
                  unitPrice: it.price,
                  totalPrice: (it.price ?? 0) * (it.quantity ?? 1),
                  notes: it.notes ?? '',
                  ...(merged ? { customizations: merged as object } : {}),
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

      // Create parent order
      const parentOrderNumber = generateOrderNumber()
      const apParentOfferMeta = buildOrderSpecialOffersMetadata(items as Record<string, unknown>[])
      parentOrder = await prisma.order.create({
        data: {
          orderNumber: parentOrderNumber,
          customerId: user.id,
          vendorId: null,
          addressId,
          module: "AUTO_PARTS",
          status: "PENDING",
          subtotal,
          deliveryFee,
          serviceFee: 0,
          tax: 0,
          discount: promoDiscount,
          total: total as number,
          platformCommission,
          vendorCommission,
          paymentStatus: paymentData?.status === 'succeeded' ? 'PAID' : 'PENDING',
          paymentMethod: paymentMethod || 'CARD',
          notes: notes ?? `Multi-store order from ${stores.length} stores`,
          isChildOrder: false as any,
          childId: null as any,
          ...(apParentOfferMeta ? { metadata: { specialOffers: apParentOfferMeta } as object } : {}),
          orderItems: {
            create: items.map((it: any) => {
              const c = mergeAutoPartsItemCustomizations(it)
              const hasOffer = c && String(c.kiloOfferId || "").trim()
              const merged = hasOffer ? { ...c, kiloSaleSource: "SPECIAL_OFFER" } : c
              return {
                productId: it.productId || it.partId || '',
                productType: "AUTO_PART",
                productName: it.name,
                quantity: it.quantity ?? 1,
                unitPrice: it.price,
                totalPrice: (it.price ?? 0) * (it.quantity ?? 1),
                notes: it.notes ?? '',
                ...(merged ? { customizations: merged as object } : {}),
              }
            }),
          },
          orderTracking: {
            create: { status: "PENDING", notes: "Order placed successfully" },
          },
        },
        include: { orderItems: true, address: true },
      })

      // Link child orders to parent
      await prisma.order.updateMany({
        where: { id: { in: childOrders.map(co => co.id) } },
        data: { childId: parentOrder.id as any },
      })
    } else {
      // Single store: Create regular order
      const orderNumber = generateOrderNumber()
      const apSingleOfferMeta = buildOrderSpecialOffersMetadata(items as Record<string, unknown>[])
      parentOrder = await prisma.order.create({
        data: {
          orderNumber,
          customerId: user.id,
          vendorId: primaryStore.userId,
          addressId,
          module: "AUTO_PARTS",
          status: "PENDING",
          subtotal,
          deliveryFee,
          serviceFee: 0,
          tax: 0,
          discount: promoDiscount,
          total,
          vendorCommission,
          platformCommission,
          paymentStatus: paymentMethod === "PAY_NOW" ? "PENDING" : "PENDING",
          paymentMethod,
          notes,
          autoPartId: null as string | null,
          isChildOrder: false as any,
          childId: null as any,
          ...(apSingleOfferMeta ? { metadata: { specialOffers: apSingleOfferMeta } as object } : {}),
          orderItems: {
            create: items.map((item: any) => {
              const c = mergeAutoPartsItemCustomizations(item)
              const hasOffer = c && String(c.kiloOfferId || "").trim()
              const merged = hasOffer ? { ...c, kiloSaleSource: "SPECIAL_OFFER" } : c
              return {
                productId: item.productId || item.partId || '',
                productType: "AUTO_PART",
                productName: item.name,
                quantity: item.quantity,
                unitPrice: item.price,
                totalPrice: item.price * item.quantity,
                notes: item.notes || '',
                ...(merged ? { customizations: merged as object } : {}),
              }
            }),
          },
          orderTracking: {
            create: {
              status: "PENDING",
              notes: "Order placed successfully",
            }
          }
        },
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

    // Save route data for multi-store orders
    if (isMultiStore && routeData) {
      try {
        await saveRouteToMultiplePickups(order.id, routeData, 'AUTO_PARTS')
      } catch (error) {
        console.error('Error saving route data:', error)
      }
    }

    // Create courier booking
    const bookingNumber = `CB-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
    const courierBooking = await prisma.courierBooking.create({
      data: {
        bookingNumber,
        customerId: user.id,
        orderId: order.id,
        rideTypeId: rideType.id,
        pickupAddress: isMultiStore 
          ? `Multiple stores: ${stores.map(s => s.storeName).join(', ')}`
          : primaryStore.address,
        pickupLatitude: primaryStore.latitude!,
        pickupLongitude: primaryStore.longitude!,
        dropAddress: `${address.street}, ${address.city}, ${address.state}`,
        dropLatitude: dropLat!,
        dropLongitude: dropLng!,
        distance,
        estimatedTime,
        fare: deliveryFee,
        status: "REQUESTED",
        paymentStatus: paymentData?.status === 'succeeded' ? 'PAID' : 'PENDING',
        paymentMethod: paymentMethod || 'CARD',
        packageType: "Auto Parts",
        module: "AUTO_PARTS",
        notes: notes || `Auto parts order: ${items.length} items${isMultiStore ? ` from ${stores.length} stores` : ''}`,
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
        orderNumberHint: order.orderNumber as string,
      })
    } catch (wErr) {
      console.error("Auto-parts pending vendor wallets:", wErr)
    }

    try {
      await ensureVendorCommissionRecordsForOrderTree(order.id)
      await ensurePlatformFeeReportingVendorCommissions(order.id)
    } catch (pcErr) {
      console.error("Auto-parts vendor commission record:", pcErr)
    }

    // Create payment record if payment data provided
    if (paymentData) {
      await prisma.payment.create({
        data: {
          userId: user.id,
          orderId: order.id,
          amount: total,
          currency: settings?.defaultCurrency || "NGN",
          status: paymentData.status === 'succeeded' ? 'PAID' : 'PENDING',
          gateway: paymentData.gateway || 'STRIPE',
          gatewayTransactionId: paymentData.id || paymentData.transactionId || undefined,
          metadata: paymentData
        }
      })
    }

    // Update order payment status if payment succeeded
    if (paymentData?.status === 'succeeded') {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'PAID' }
      })
    }

    // Send notification to vendor(s)
    const socketServer = getGlobalSocketServer()
    for (const vendorId of vendorIds) {
      socketServer?.sendNotificationToUser(vendorId, {
        type: 'notification',
        title: 'New Auto Parts Order',
        message: `You have a new order #${order.orderNumber}`,
        orderId: order.id,
        orderNumber: order.orderNumber as string
      })
      try {
        await NotificationBridge.sendNotification({
          userId: vendorId,
          title: "New Auto Parts Order",
          message: `You have a new order #${order.orderNumber}`,
          type: "ORDER_UPDATE",
          module: "AUTO_PARTS",
          data: {
            actionType: "navigate",
            screen: "OrderDetails",
            params: [{ name: "orderId", value: order.id }],
          },
          actionUrl: `/auto-parts/orders/${order.id}`,
        })
      } catch (ne) {
        console.error("Auto-parts vendor NotificationBridge:", ne)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
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
        },
        message: `Order #${order.orderNumber} placed successfully`
      }
    })

  } catch (error: any) {
    console.error("Auto parts checkout error:", error)
    return NextResponse.json(
      { error: "Failed to process checkout", details: error.message },
      { status: 500 }
    )
  }
}

