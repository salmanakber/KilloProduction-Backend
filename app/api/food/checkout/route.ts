import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NotificationBridge } from "@/lib/notification-bridge"
import { awardLoyaltyPoints, redeemLoyaltyPoints } from "@/lib/loyalty-service"
import { calculateRouteAndFee, type PickupPoint, type DropoffPoint } from "@/lib/multi-pickup-route.service"
import { saveRouteToMultiplePickups } from "@/lib/multi-pickup-route-helper"
import { createSplitPayments } from "@/lib/payment-service"
import { recordPaymentProcessingLedgerIfApplicable } from "@/lib/payment-processing-ledger"
import { createOrderCompletionWalletTransactions } from "@/lib/wallet-transaction-service"
import { createPendingVendorWalletsForCourierOrder } from "@/lib/create-pending-vendor-wallet-for-courier-order"
import { checkoutPlatformFeeAmount, checkoutVendorCommissionAmount } from "@/lib/commission-service"
import {
  ensurePlatformFeeReportingVendorCommissions,
  ensureVendorCommissionRecordsForOrderTree,
  splitAmountByWeights,
} from "@/lib/order-vendor-platform-fee-record"
import {
  combineRestaurantPrepLines,
  foodRiderDispatchDelayMs,
  preparationMinutesForLineItem,
} from "@/lib/food-prep-time"
import { scheduleFoodRiderDispatchJob } from "@/lib/food-rider-dispatch-queue"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { getDrivingDistanceKmSmart } from "@/lib/driving-distance-smart"
import { applyClientDeliveryChargeIfProvided } from "@/lib/checkout-client-amounts"
import {
  computeVendorOfferSettlementPayout,
  settlementMerchandiseFromCartLines,
} from "@/lib/pharmacy-vendor-settlement"
import { buildOrderSpecialOffersMetadata, mergeOrderMetadata } from "@/lib/order-special-offer-metadata"
import { resolveCourierRideTypeForCheckout } from "@/lib/resolve-courier-ride-type"

// Helper function to generate order number
function generateOrderNumber(): string {
  return `FOOD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
}

// Helper function to generate booking number
function generateBookingNumber(): string {
  return `CB-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
}

// Helper to resolve coordinates
async function resolveCoordinates(
  address: string,
  apiKey: string
): Promise<{ latitude: number; longitude: number; fullAddress?: string }> {
  const params = new URLSearchParams({
    address,
    key: apiKey
  })
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Geocoding failed')
  const data = await res.json()
  if (data.status !== 'OK' || !data.results?.[0]) throw new Error('Address not found')
  const location = data.results[0].geometry.location
  return {
    latitude: location.lat,
    longitude: location.lng,
    fullAddress: data.results[0].formatted_address
  }
}

async function getDrivingDistance(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string
): Promise<{ distance: number; duration: number } | null> {
  try {
    const r = await getDrivingDistanceKmSmart(originLat, originLng, destLat, destLng, apiKey)
    return { distance: r.distance, duration: r.durationMinutes }
  } catch (error) {
    console.error('Distance calculation error:', error)
    return null
  }
}

// Calculate fare
function calculateFare(rideType: any, distanceKm: number, durationMinutes: number): number {
  const basePrice = rideType.basePrice || 0
  const pricePerKm = rideType.pricePerKm || 0
  const pricePerMinute = rideType.pricePerMinute || 0
  return Math.round((basePrice + (pricePerKm * distanceKm) + (pricePerMinute * durationMinutes)) * 100) / 100
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { items, addressId, paymentMethod, paymentData, notes, calculatedAmounts, loyaltyPointsRedeemed, promoCodeId } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 })
    }

    if (!addressId) {
      return NextResponse.json({ error: "Delivery address is required" }, { status: 400 })
    }

    // Get delivery address
    const address = await prisma.address.findUnique({
      where: { id: addressId, userId: user.id }
    })

    if (!address) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 })
    }

    // Get coordinates for delivery address
    let dropLatitude = address.latitude
    let dropLongitude = address.longitude

    if (!dropLatitude || !dropLongitude) {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY
      if (!apiKey) {
        return NextResponse.json({ error: "Geocoding service unavailable" }, { status: 500 })
      }
      const coords = await resolveCoordinates(
        `${address.street}, ${address.city}, ${address.state}`,
        apiKey
      )
      dropLatitude = coords.latitude
      dropLongitude = coords.longitude
      
      await prisma.address.update({
        where: { id: addressId },
        data: { latitude: dropLatitude, longitude: dropLongitude }
      })
    }

    // Group items by restaurant
    const itemsByRestaurant: Record<string, any[]> = {}
    const restaurantMap: Record<string, any> = {}
    const restaurantIds: string[] = []

    for (const item of items) {
      const restaurantId = item.restaurantId
      if (!restaurantId) {
        return NextResponse.json({ error: `Item ${item.id} missing restaurantId` }, { status: 400 })
      }

      if (!itemsByRestaurant[restaurantId]) {
        itemsByRestaurant[restaurantId] = []
        restaurantIds.push(restaurantId)
      }
      itemsByRestaurant[restaurantId].push(item)
    }

    // Fetch all restaurants
    const restaurants = await prisma.restaurant.findMany({
      where: { id: { in: restaurantIds } },
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
        userId: true,
      }
    })

    for (const restaurant of restaurants) {
      restaurantMap[restaurant.id] = restaurant
    }

    // Validate all restaurants exist
    for (const restaurantId of restaurantIds) {
      if (!restaurantMap[restaurantId]) {
        return NextResponse.json({ error: `Restaurant ${restaurantId} not found` }, { status: 404 })
      }
    }

    const isMultiRestaurant = restaurantIds.length > 1

    const productIds = Array.from(
      new Set(items.map((i: any) => String(i.productId || i.id || "").trim()).filter(Boolean))
    )
    const menuRows = await prisma.menuItem.findMany({
      where: { id: { in: productIds } },
      select: { id: true, preparationTime: true },
    })
    const prepByProductId = new Map(menuRows.map((m) => [m.id, m.preparationTime]))

    const prepByRestaurant: Record<string, number> = {}
    for (const rid of restaurantIds) {
      const rItems = itemsByRestaurant[rid] || []
      const lines = rItems.map((it: any) => {
        const pid = String(it.productId || it.id || "").trim()
        const base = prepByProductId.get(pid) ?? 15
        return preparationMinutesForLineItem(base, Number(it.quantity) || 0)
      })
      prepByRestaurant[rid] = combineRestaurantPrepLines(lines)
    }

    const sortedRestaurantIds = isMultiRestaurant
      ? [...restaurantIds].sort((a, b) => (prepByRestaurant[a] ?? 0) - (prepByRestaurant[b] ?? 0))
      : [...restaurantIds]

    const firstPickupPrepMinutes =
      sortedRestaurantIds.length > 0 ? prepByRestaurant[sortedRestaurantIds[0]] ?? 0 : 0

    const riderDispatchDelayMs = foodRiderDispatchDelayMs(firstPickupPrepMinutes)
    const dispatchScheduledAt = new Date(Date.now() + riderDispatchDelayMs)
    const foodPrepMeta = {
      prepByRestaurant,
      sortedRestaurantIds,
      firstPickupPrepMinutes,
      riderDispatchDelayMs,
      dispatchScheduledAt: dispatchScheduledAt.toISOString(),
    }

    // Calculate subtotal
    let subtotal = 0
    for (const item of items) {
      subtotal += item.price * item.quantity
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
        if (!modules || modules.length === 0 || modules.includes("FOOD")) {
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

    const discountedSubtotalFood = Math.max(0, subtotal - promoDiscount)
    const platformCommission = await checkoutPlatformFeeAmount("FOOD", discountedSubtotalFood)
    const vendorCommissionSubtotalFood = settlementMerchandiseFromCartLines(
      items,
      subtotal,
      promoDiscount,
    )
    const vendorCommissionTotal = await checkoutVendorCommissionAmount(
      "FOOD",
      vendorCommissionSubtotalFood,
    )

    const rideType = await resolveCourierRideTypeForCheckout()
    if (!rideType) {
      return NextResponse.json({ error: "Courier service not available" }, { status: 503 })
    }

    // Ensure all restaurants have coordinates
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    for (const restaurant of restaurants) {
      if (restaurant.latitude == null || restaurant.longitude == null) {
        if (!apiKey) {
          return NextResponse.json({ error: "Geocoding service unavailable" }, { status: 500 })
        }
        const coords = await resolveCoordinates(restaurant.address, apiKey)
        await prisma.restaurant.update({
          where: { id: restaurant.id },
          data: { latitude: coords.latitude, longitude: coords.longitude },
        })
        restaurant.latitude = coords.latitude
        restaurant.longitude = coords.longitude
      }
    }

    const restaurantsForRoute = sortedRestaurantIds.map((id) => restaurantMap[id])

    // Calculate route and delivery fee
    let distance = calculatedAmounts?.distance ?? 5
    let estimatedTime = calculatedAmounts?.estimatedArrivalMinutes ?? 30
    let deliveryFee = 0
    let routeData: any = null

    if (isMultiRestaurant) {
      // Multi-restaurant: pickup order follows kitchen readiness (shortest prep first); fixed waypoint order
      const pickupPoints: PickupPoint[] = restaurantsForRoute.map((restaurant) => ({
        id: restaurant.id,
        name: restaurant.name,
        address: restaurant.address,
        latitude: restaurant.latitude!,
        longitude: restaurant.longitude!,
        module: "FOOD",
        storeType: "RESTAURANT",
      }))

      const dropoffPoint: DropoffPoint = {
        id: address.id,
        address: `${address.street}, ${address.city}, ${address.state}`,
        latitude: dropLatitude!,
        longitude: dropLongitude!,
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
          apiKey,
          { optimizePickupOrder: false }
        )

        if (routeResult.isValid && routeResult.route) {
          routeData = routeResult.route
          distance = routeResult.route.totalDistance
          estimatedTime = routeResult.route.estimatedDeliveryTime
          deliveryFee = routeResult.deliveryFee.totalFee
        } else {
          // Fallback to simple calculation
          const firstRestaurant = restaurants[0]
          const distData = await getDrivingDistance(
            firstRestaurant.latitude!,
            firstRestaurant.longitude!,
            dropLatitude!,
            dropLongitude!,
            apiKey
          )
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
      // Single restaurant: Use existing simple calculation
      const restaurant = restaurants[0]
      if (apiKey) {
        const distData = await getDrivingDistance(
          restaurant.latitude!,
          restaurant.longitude!,
          dropLatitude!,
          dropLongitude!,
          apiKey
        )
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

    const total = Math.max(0, subtotal - promoDiscount) + deliveryFee + platformCommission
    const loyaltyMeta =
      loyaltyPointsRedeemed && loyaltyPointsRedeemed > 0
        ? {
            loyalty: {
              pointsRedeemed: Number(loyaltyPointsRedeemed),
              discountAmount: Number(paymentData?.loyaltyDiscount || 0),
            },
          }
        : {}

    let parentOrder: any = null
    const childOrders: any[] = []

    if (isMultiRestaurant) {
      // Create child orders for each restaurant
      // Distribute promo discount across child orders by subtotal share
      let remainingDiscount = promoDiscount
      const discountByRestaurant: Record<string, number> = {}
      for (let i = 0; i < restaurantIds.length; i++) {
        const restaurantId = restaurantIds[i]
        const restaurantItems = itemsByRestaurant[restaurantId] || []
        let restaurantSubtotal = 0
        for (const item of restaurantItems) restaurantSubtotal += item.price * item.quantity
        const share = subtotal > 0 ? restaurantSubtotal / subtotal : 0
        const d = i === restaurantIds.length - 1 ? remainingDiscount : Math.round(promoDiscount * share * 100) / 100
        discountByRestaurant[restaurantId] = Math.max(0, d)
        remainingDiscount = Math.max(0, Math.round((remainingDiscount - discountByRestaurant[restaurantId]) * 100) / 100)
      }

      const restaurantNets = restaurantIds.map((rid) => {
        const itemsR = itemsByRestaurant[rid] || []
        let s = 0
        for (const item of itemsR) s += item.price * item.quantity
        return Math.max(0, s - (discountByRestaurant[rid] || 0))
      })
      const foodPlatformParts = splitAmountByWeights(platformCommission, restaurantNets)
      const foodVendorParts = splitAmountByWeights(vendorCommissionTotal, restaurantNets)

      for (let ri = 0; ri < restaurantIds.length; ri++) {
        const restaurantId = restaurantIds[ri]
        const restaurantItems = itemsByRestaurant[restaurantId] || []
        const restaurant = restaurantMap[restaurantId]
        
        // Calculate subtotal for this restaurant
        let restaurantSubtotal = 0
        for (const item of restaurantItems) {
          restaurantSubtotal += item.price * item.quantity
        }

        const restaurantPlatformCommission = foodPlatformParts[ri] ?? 0
        const restaurantVendorCommission = foodVendorParts[ri] ?? 0

        // Calculate delivery fee proportion (distribute based on subtotal ratio)
        const restaurantDeliveryFee = (restaurantSubtotal / subtotal) * deliveryFee
        const restaurantDiscount = discountByRestaurant[restaurantId] || 0
        const restaurantTotal = Math.max(0, restaurantSubtotal - restaurantDiscount) + restaurantDeliveryFee + restaurantPlatformCommission

        const childOrderNumber = generateOrderNumber()
        const foodMetaChild = mergeOrderMetadata(
          { food: foodPrepMeta } as Record<string, unknown>,
          (() => {
            const m = buildOrderSpecialOffersMetadata(restaurantItems as Record<string, unknown>[])
            return m ? { specialOffers: m } : {}
          })(),
        )
        const foodMetaChildWithLoyalty = mergeOrderMetadata(foodMetaChild, loyaltyMeta)
        const childOrder = await prisma.order.create({
          data: {
            orderNumber: childOrderNumber,
            customerId: user.id,
            vendorId: restaurant.userId,
            addressId,
            module: "FOOD",
            status: "PENDING",
            subtotal: restaurantSubtotal,
            deliveryFee: restaurantDeliveryFee,
            serviceFee: 0,
            tax: 0,
            discount: restaurantDiscount,
            total: restaurantTotal as number,
            platformCommission: restaurantPlatformCommission,
            vendorCommission: restaurantVendorCommission,
            paymentStatus: paymentData?.status === 'succeeded' ? 'PAID' : 'PENDING',
            paymentMethod: paymentMethod || 'CARD',
            notes,
            metadata: foodMetaChildWithLoyalty as any,
            foodId: restaurant.id,
            isChildOrder: true as any,
            orderItems: {
              create: restaurantItems.map((item: any) => {
                const c = (item.customizations as any) || undefined
                const hasOffer = !!(c && String(c.kiloOfferId || "").trim())
                const merged = hasOffer ? { ...c, kiloSaleSource: "SPECIAL_OFFER" } : c
                return {
                  productId: item.productId || item.id,
                  productType: "MENU_ITEM",
                  productName: item.name,
                  quantity: item.quantity,
                  unitPrice: item.price,
                  totalPrice: item.price * item.quantity,
                  notes: item.notes,
                  customizations: merged,
                }
              })
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
          }
        })

        childOrders.push(childOrder)
      }

      // Create parent order that aggregates all child orders
      const parentOrderNumber = generateOrderNumber()
      const foodMetaParent = mergeOrderMetadata(
        { food: foodPrepMeta } as Record<string, unknown>,
        (() => {
          const m = buildOrderSpecialOffersMetadata(items as Record<string, unknown>[])
          return m ? { specialOffers: m } : {}
        })(),
      )
      const foodMetaParentWithLoyalty = mergeOrderMetadata(foodMetaParent, loyaltyMeta)
      parentOrder = await prisma.order.create({
        data: {
          orderNumber: parentOrderNumber,
          customerId: user.id,
          vendorId: null, // No single vendor for multi-restaurant orders
          addressId,
          module: "FOOD",
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
          notes: notes || `Multi-restaurant order from ${restaurantIds.length} restaurants`,
          metadata: foodMetaParentWithLoyalty as any,
          foodId: null,
          isChildOrder: false as any,
          childId: null as any,
          orderItems: {
            create: items.map((item: any) => {
              const c = (item.customizations as any) || undefined
              const hasOffer = !!(c && String(c.kiloOfferId || "").trim())
              const merged = hasOffer ? { ...c, kiloSaleSource: "SPECIAL_OFFER" } : c
              return {
                productId: item.productId || item.id,
                productType: "MENU_ITEM",
                productName: item.name,
                quantity: item.quantity,
                unitPrice: item.price,
                totalPrice: item.price * item.quantity,
                notes: item.notes,
                customizations: merged,
              }
            })
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
        }
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
      // Single restaurant: Create regular order (no parent-child relationship)
      const orderNumber = generateOrderNumber()
      const foodMetaSingle = mergeOrderMetadata(
        { food: foodPrepMeta } as Record<string, unknown>,
        (() => {
          const m = buildOrderSpecialOffersMetadata(items as Record<string, unknown>[])
          return m ? { specialOffers: m } : {}
        })(),
      )
      const foodMetaSingleWithLoyalty = mergeOrderMetadata(foodMetaSingle, loyaltyMeta)
      parentOrder = await prisma.order.create({
        data: {
          orderNumber,
          customerId: user.id,
          vendorId: restaurantMap[restaurantIds[0]].userId,
          addressId,
          module: "FOOD",
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
          notes,
          metadata: foodMetaSingleWithLoyalty as any,
          foodId: restaurantIds[0],
          isChildOrder: false as any,
          childId: null as any,
          orderItems: {
            create: items.map((item: any) => {
              const c = (item.customizations as any) || undefined
              const hasOffer = !!(c && String(c.kiloOfferId || "").trim())
              const merged = hasOffer ? { ...c, kiloSaleSource: "SPECIAL_OFFER" } : c
              return {
                productId: item.productId || item.id,
                productType: "MENU_ITEM",
                productName: item.name,
                quantity: item.quantity,
                unitPrice: item.price,
                totalPrice: item.price * item.quantity,
                notes: item.notes,
                customizations: merged,
              }
            })
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

    // Handle loyalty points redemption if user redeemed points
    if (loyaltyPointsRedeemed && loyaltyPointsRedeemed > 0) {
      try {
        const redeemResult = await redeemLoyaltyPoints(
          user.id,
          loyaltyPointsRedeemed,
          order.id,
          `Points redeemed for food order #${order.orderNumber}`
        )
        if (!redeemResult.success) {
          console.error("Failed to redeem loyalty points:", redeemResult.error)
          // Don't fail the order if redemption fails, just log it
        }
      } catch (error) {
        console.error("Error redeeming loyalty points:", error)
        // Continue with order creation even if redemption fails
      }
    }

    // Create courier booking first (needed for payment references)
    const bookingNumber = generateBookingNumber()
    const primaryRestaurantForBooking = restaurantsForRoute[0]

    const courierBooking = await prisma.courierBooking.create({
      data: {
        bookingNumber,
        customerId: user.id,
        orderId: order.id,
        rideTypeId: rideType.id,
        pickupAddress: isMultiRestaurant
          ? `Multiple restaurants: ${restaurantsForRoute.map((r) => r.name).join(", ")}`
          : primaryRestaurantForBooking.address,
        pickupLatitude: primaryRestaurantForBooking.latitude!,
        pickupLongitude: primaryRestaurantForBooking.longitude!,
        dropAddress: `${address.street}, ${address.city}, ${address.state}`,
        dropLatitude: dropLatitude!,
        dropLongitude: dropLongitude!,
        distance,
        estimatedTime,
        fare: deliveryFee,
        status: "AWAITING_PREP" as any,
        scheduledAt: dispatchScheduledAt,
        paymentStatus: paymentData?.status === "succeeded" ? "PAID" : "PENDING",
        paymentMethod: paymentMethod || "CARD",
        packageType: "Food",
        module: "FOOD",
        notes:
          notes ||
          `Food order: ${items.length} items${isMultiRestaurant ? ` from ${restaurants.length} restaurants` : ""}`,
        recipientName: user.name ?? undefined,
        recipientPhone: user.phone ?? "",
      },
    })

    const queuedDispatch = await scheduleFoodRiderDispatchJob({
      courierBookingId: courierBooking.id,
      orderId: order.id,
      delayMs: riderDispatchDelayMs,
    })

    let courierStatus: "AWAITING_PREP" | "REQUESTED" = "AWAITING_PREP"
    let trackingNotes =
      "Rider dispatch scheduled after kitchen prep window (food)"

    if (!queuedDispatch) {
      await prisma.courierBooking.update({
        where: { id: courierBooking.id },
        data: { status: "REQUESTED", scheduledAt: null },
      })
      courierStatus = "REQUESTED"
      trackingNotes = "Booking created, looking for nearby riders"
      await getGlobalSocketServer().broadcastCourierNewRequestToRiders({
        bookingId: courierBooking.id,
        bookingNumber: courierBooking.bookingNumber,
        type: "courier",
        module: "FOOD",
        pickupLatitude: courierBooking.pickupLatitude,
        pickupLongitude: courierBooking.pickupLongitude,
        dropLatitude: courierBooking.dropLatitude,
        dropLongitude: courierBooking.dropLongitude,
        estimatedFare: courierBooking.fare,
        distance: courierBooking.distance,
        estimatedTime: courierBooking.estimatedTime,
        pickupAddress: courierBooking.pickupAddress,
        dropAddress: courierBooking.dropAddress,
        customerId: courierBooking.customerId,
        createdAt: courierBooking.createdAt,
      })
    }

    if (isMultiRestaurant) {
      await prisma.multiplePickup.updateMany({
        where: { orderId: order.id },
        data: { courierBookingId: courierBooking.id },
      })
    }

    await prisma.courierTracking.create({
      data: {
        bookingId: courierBooking.id,
        status: courierStatus as any,
        notes: trackingNotes,
      },
    })

    try {
      await createPendingVendorWalletsForCourierOrder({
        parentOrderId: order.id,
        courierBookingId: courierBooking.id,
        orderNumberHint: order.orderNumber,
      })
    } catch (wErr) {
      console.error("Food pending vendor wallets:", wErr)
    }

    try {
      await ensureVendorCommissionRecordsForOrderTree(order.id)
      await ensurePlatformFeeReportingVendorCommissions(order.id)
    } catch (pcErr) {
      console.error("Food vendor commission record:", pcErr)
    }

    // Use currency from PaymentScreen (paymentData.currency) or default to NGN
    const paymentCurrency = paymentData?.currency || "NGN"

    // Create split payments: one for each vendor order + one for rider
    if (paymentData && paymentData.status === "succeeded") {
      try {
        const vendorPayments = isMultiRestaurant
          ? childOrders.map(childOrder => ({
              vendorId: childOrder.vendorId!,
              orderId: childOrder.id,
              amount: childOrder.total,
            }))
          : [{
              vendorId: restaurantMap[restaurantIds[0]].userId,
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
          paymentMethodId:
            typeof paymentData.paymentMethodId === "string" ? paymentData.paymentMethodId : undefined,
          gatewayResponse: paymentData.gatewayResponse ?? paymentData,
          description: `Payment for food order ${order.orderNumber}`,
          metadata: {
            ...(paymentData as object),
            orderNumber: order.orderNumber,
            isMultiRestaurant,
            parentOrderId: order.id,
          },
          vendorPayments,
          riderPayment,
        })

        const feeAmount = Number(paymentData?.paymentProcessingFee ?? 0)
        const ledgerPaymentId =
          splitPaymentResult.vendorPayments?.[0]?.id ?? splitPaymentResult.riderPayment?.id ?? null
        if (ledgerPaymentId && feeAmount > 0) {
          await recordPaymentProcessingLedgerIfApplicable({
            paymentId: ledgerPaymentId,
            userId: user.id,
            module: "FOOD",
            orderAmount: Number(paymentData?.commissionBaseAmount ?? total - feeAmount),
            feeAmount,
            ratePercent: Number(paymentData?.paymentProcessingRate ?? 0),
            currency: paymentCurrency,
            gateway: paymentData.gateway || "STRIPE",
          })
        }
        
        console.log(`Created payment group ${splitPaymentResult.paymentGroupId} with ${splitPaymentResult.vendorPayments.length} vendor payments and ${splitPaymentResult.riderPayment ? 1 : 0} rider payment`)

        // Create wallet transactions (pending) for vendors and rider
        // Vendor transactions
        for (const vendorPayment of vendorPayments) {
          const p = await computeVendorOfferSettlementPayout(vendorPayment.orderId)
          await createOrderCompletionWalletTransactions({
            vendorId: vendorPayment.vendorId,
            vendorAmount: p.vendorPayout,
            orderId: vendorPayment.orderId,
            courierBookingId: courierBooking.id,
            description: `Payment for food order ${order.orderNumber}`,
          })
        }

        // Rider transaction will be created when rider accepts the booking
      } catch (error) {
        console.error('Error creating split payments:', error)
        // Fallback to single payment if split fails
        await prisma.payment.create({
          data: {
            userId: user.id,
            orderId: order.id,
            amount: total,
            currency: paymentCurrency,
            status: 'PAID',
            gateway: paymentData.gateway || 'STRIPE',
            gatewayTransactionId: paymentData.id ?? paymentData.transactionId ?? undefined,
            metadata: {
              ...(paymentData as object),
              orderNumber: order.orderNumber,
              isMultiRestaurant,
            },
          },
        }).catch(console.error)
      }
    } else if (paymentData) {
      // Payment pending - create single payment record
      await prisma.payment.create({
        data: {
          userId: user.id,
          orderId: order.id,
          amount: total,
          currency: paymentCurrency,
          status: 'PENDING',
          gateway: paymentData.gateway || 'STRIPE',
          gatewayTransactionId: paymentData.id ?? paymentData.transactionId ?? undefined,
          metadata: {
            ...(paymentData as object),
            orderNumber: order.orderNumber,
            isMultiRestaurant,
          },
        },
      }).catch(console.error)
    }

    // Save route data for multi-restaurant orders (link to parent order)
    if (isMultiRestaurant && routeData) {
      try {
        await saveRouteToMultiplePickups(order.id, routeData, 'FOOD')
      } catch (error) {
        console.error('Error saving route data:', error)
        // Don't fail the order if route saving fails
      }
    }

    // Award loyalty points for the order (only if payment succeeded)
    // Points are awarded based on the formula in LoyaltyPointSettings
    if (paymentData?.status === 'succeeded' || paymentMethod === 'WALLET') {
      try {
        const awardResult = await awardLoyaltyPoints({
          userId: user.id,
          orderId: order.id,
          module: "FOOD",
          orderAmount: total,
          reason: `Points earned from food order #${order.orderNumber}`,
        })
        
        if (awardResult.success) {
          console.log(`Awarded ${awardResult.points} loyalty points to user ${user.id} for order ${order.id}`)
        } else {
          console.log(`No loyalty points awarded: ${awardResult.error}`)
        }
      } catch (error) {
        console.error("Error awarding loyalty points:", error)
        // Don't fail the order if loyalty points award fails
      }
    }

    // Send notifications
    try {
      // Notify customer
      await NotificationBridge.sendNotification({
        userId: user.id,
        title: "Order Placed Successfully",
            message: `Your order #${order.orderNumber} has been placed and is being prepared.`,
        type: "ORDER_UPDATE",
        module: "FOOD",
        data: {
          actionType: "navigate",
          screen: "OrderDetails",
          params: [{ name: "orderId", value: order.id }]
        },
        actionUrl: `/orders/${order.id}`
      })

      // Notify each restaurant
      if (isMultiRestaurant) {
        // Multiple restaurants - notify each vendor about their child order
        for (const childOrder of childOrders) {
          const restaurantId = childOrder.foodId
          const restaurant = restaurantMap[restaurantId]
          const restaurantUser = await prisma.user.findUnique({
            where: { id: restaurant.userId }
          })
          
          if (restaurantUser) {
            await NotificationBridge.sendNotification({
              userId: restaurantUser.id,
              title: "New Food Order",
              message: `You have a new order #${childOrder.orderNumber} with ${itemsByRestaurant[restaurantId]?.length || 0} items.`,
              type: "ORDER_UPDATE",
              module: "FOOD",
              data: {
                actionType: "navigate",
                screen: "OrderDetails",
                params: [{ name: "orderId", value: childOrder.id }]
              },
              actionUrl: `/vendor/food/orders/${childOrder.id}`
            })
          }
        }
      } else {
        // Single restaurant
        const restaurant = restaurantMap[restaurantIds[0]]
        const restaurantUser = await prisma.user.findUnique({
          where: { id: restaurant.userId }
        })
        
        if (restaurantUser) {
          await NotificationBridge.sendNotification({
            userId: restaurantUser.id,
            title: "New Food Order",
            message: `You have a new order #${order.orderNumber} with ${items.length} items.`,
            type: "ORDER_UPDATE",
            module: "FOOD",
            data: {
              actionType: "navigate",
              screen: "OrderDetails",
              params: [{ name: "orderId", value: order.id }]
            },
            actionUrl: `/vendor/food/orders/${order.id}`
          })
        }
      }
    } catch (notifError) {
      console.error("Notification error:", notifError)
    }

    return NextResponse.json({
      success: true,
      data: {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          total: total as number,
          status: order.status,
          isChildOrder: order.isChildOrder,
          childId: order.childId,
          childOrders: isMultiRestaurant ? childOrders.map(co => ({
            id: co.id,
            orderNumber: co.orderNumber,
            vendorId: co.vendorId,
            total: co.total,
          })) : undefined,
        },
        courierBooking: {
          id: courierBooking.id,
          bookingNumber: courierBooking.bookingNumber,
        },
        breakdown: {
          subtotal,
          deliveryFee,
          platformCommission,
          total: total as number,
        }
      }
    })
  } catch (error: any) {
    console.error("Food checkout error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to process checkout" },
      { status: 500 }
    )
  }
}
