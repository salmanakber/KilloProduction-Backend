import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getSocketServer } from "@/lib/socket-init"
import { calculateRouteAndFee, type PickupPoint, type DropoffPoint } from "@/lib/multi-pickup-route.service"
import { saveRouteToMultiplePickups } from "@/lib/multi-pickup-route-helper"
import { sendEmailFromTemplate } from "@/lib/email"
import { createPendingVendorWalletsForCourierOrder } from "@/lib/create-pending-vendor-wallet-for-courier-order"
import { checkoutPlatformFeeAmount, checkoutVendorCommissionAmount } from "@/lib/commission-service"
import {
  ensurePlatformFeeReportingVendorCommissions,
  ensureVendorCommissionRecordsForOrderTree,
  splitAmountByWeights,
} from "@/lib/order-vendor-platform-fee-record"
import { getDrivingDistanceKmSmart } from "@/lib/driving-distance-smart"

// Generate 6-digit OTP
function generateOrderNumber(): string {
  return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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

async function buildPharmacyOrderItemCreateInput(item: any) {
  const pharmacyMedicine = await prisma.pharmacyMedicine.findFirst({
    where: {
      id: item.medicineId,
      pharmacyId: item.pharmacyId,
    },
    include: {
      centralMedicine: true,
    },
  })
  return {
    productId: pharmacyMedicine?.centralMedicine?.id || "",
    productType: "MEDICINE",
    productName: item.name,
    quantity: item.quantity,
    unitPrice: item.price,
    totalPrice: item.price * item.quantity,
    notes: item.notes,
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { 
      items, // Array of cart items with { pharmacyId, productId, name, quantity, price }
      addressId,
      paymentMethod,
      paymentData,
      rideTypeId,
      calculatedAmounts, // From distanceService on mobile
      notes,
      promoCodeId
    } = body
    

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No items in cart" }, { status: 400 })
    }


    if (!addressId) {
      return NextResponse.json({ error: "Delivery address is required" }, { status: 400 })
    }

    // Get delivery address with coordinates
    const address = await prisma.address.findUnique({
      where: { id: addressId, userId: user.id }
    })

    if (!address) {
      return NextResponse.json({ error: "Invalid delivery address" }, { status: 404 })
    }

    console.log('items', items)

    // Filter to only include pharmacy items (items with valid pharmacyId)
    // This endpoint is for pharmacy checkout, so we ignore non-pharmacy items
    const pharmacyItems = items.filter((item: any) => {
      const pharmacyId = item.pharmacyId?.trim()
      return pharmacyId && pharmacyId !== ''
    })

    if (pharmacyItems.length === 0) {
      return NextResponse.json(
        { error: "No pharmacy items found in cart. This checkout is for pharmacy orders only." },
        { status: 400 }
      )
    }

    // Log if there were non-pharmacy items filtered out
    const nonPharmacyItems = items.length - pharmacyItems.length
    if (nonPharmacyItems > 0) {
      
    }

    // Group pharmacy items by pharmacyId
    const itemsByPharmacy = pharmacyItems.reduce((acc: any, item: any) => {
      const pharmacyId = item.pharmacyId.trim()
      if (!acc[pharmacyId]) {
        acc[pharmacyId] = []
      }
      acc[pharmacyId].push(item)
      return acc
    }, {})

    // Get valid pharmacy IDs
    const pharmacyIds = Object.keys(itemsByPharmacy).filter(id => id && id.trim() !== '')
    
    if (pharmacyIds.length === 0) {
      return NextResponse.json(
        { error: "No valid pharmacy IDs found in cart items" },
        { status: 400 }
      )
    }

    
    
    // Fetch all pharmacy details
    const pharmacies = await prisma.pharmacy.findMany({
      where: { id: { in: pharmacyIds } },
      select: {
        id: true,
        pharmacyName: true,
        address: true,
        lat: true,
        lon: true,
        phone: true,
        userId: true
      }
    })

    const validPharmacyIds = pharmacyIds // Already filtered above


    // Validate all pharmacies exist
    if (pharmacies.length !== validPharmacyIds.length) {
      const foundIds = new Set(pharmacies.map(p => p.id))
      const missingIds = validPharmacyIds.filter(id => !foundIds.has(id))
      return NextResponse.json(
        { error: `Some pharmacies not found: ${missingIds.join(', ')}` },
        { status: 404 }
      )
    }

    const pharmacyMap = pharmacies.reduce((acc: any, p: any) => {
      acc[p.id] = p
      return acc
    }, {})

    // Calculate totals (only for pharmacy items)
    const subtotal = pharmacyItems.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0)
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
        if (!modules || modules.length === 0 || modules.includes("PHARMACY")) {
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

    const discountedSubtotal = Math.max(0, subtotal - promoDiscount)

    const platformCommission = await checkoutPlatformFeeAmount("PHARMACY", discountedSubtotal)
    const vendorCommissionTotal = await checkoutVendorCommissionAmount("PHARMACY", discountedSubtotal)

    // Ensure customer address has coordinates
    let dropLatitude = address.latitude
    let dropLongitude = address.longitude

    if (!dropLatitude || !dropLongitude) {
      // Geocode address if coordinates missing
      const coords = await resolveCoordinates(
        `${address.street}, ${address.city}, ${address.state}`,
        process.env.GOOGLE_MAPS_API_KEY
      )
      dropLatitude = coords.latitude
      dropLongitude = coords.longitude
      
      // Update address with coordinates
      await prisma.address.update({
        where: { id: addressId },
        data: {
          latitude: dropLatitude,
          longitude: dropLongitude
        }
      })
    }

    // Ensure all pharmacies have coordinates
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    for (const pharmacy of pharmacies) {
      if (pharmacy.lat == null || pharmacy.lon == null) {
        if (!apiKey) {
          return NextResponse.json({ error: "Geocoding service unavailable" }, { status: 500 })
        }
        const coords = await resolveCoordinates(pharmacy.address, apiKey)
        await prisma.pharmacy.update({
          where: { id: pharmacy.id },
          data: { lat: coords.latitude, lon: coords.longitude },
        })
        pharmacy.lat = coords.latitude
        pharmacy.lon = coords.longitude
      }
    }

    const isMultiPharmacy = pharmacyIds.length > 1
    const primaryPharmacy = pharmacies[0]

    // Get ride type - filter by COURIER category
    const rideType = await prisma.rideType.findFirst({
      where: { 
        category: "COURIER",
        vehicleType: "MOTORCYCLE",
        isActive: true
      },
      orderBy: { basePrice: 'asc' }
    })

    if (!rideType) {
      return NextResponse.json({ error: "Courier service not available" }, { status: 503 })
    }

    // Calculate route and delivery fee
    let deliveryFee = 0
    let distance = calculatedAmounts?.distance ?? 5
    let estimatedTime = calculatedAmounts?.estimatedArrivalMinutes ?? 30
    let routeData: any = null

    if (isMultiPharmacy) {
      // Multi-pharmacy: Use route optimization service
      const pickupPoints: PickupPoint[] = pharmacies.map(pharmacy => ({
        id: pharmacy.id,
        name: pharmacy.pharmacyName,
        address: pharmacy.address,
        latitude: pharmacy.lat!,
        longitude: pharmacy.lon!,
        module: 'PHARMACY',
        storeType: 'PHARMACY',
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
          apiKey
        )

        if (routeResult.isValid && routeResult.route) {
          routeData = routeResult.route
          distance = routeResult.route.totalDistance
          estimatedTime = routeResult.route.estimatedDeliveryTime
          deliveryFee = routeResult.deliveryFee.totalFee
        } else {
          // Fallback to simple calculation
          const firstPharmacy = pharmacies[0]
          const distData = await getDrivingDistance(
            firstPharmacy.lat!,
            firstPharmacy.lon!,
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
        deliveryFee = calculatedAmounts?.deliveryCharge || 0
      }
    } else {
      // Single pharmacy: Use simple calculation
      const pharmacy = pharmacies[0]
      if (apiKey) {
        const distData = await getDrivingDistance(
          pharmacy.lat!,
          pharmacy.lon!,
          dropLatitude!,
          dropLongitude!,
          apiKey
        )
        if (distData) {
          distance = distData.distance
          estimatedTime = Math.ceil(distData.duration)
          deliveryFee = calculateFare(rideType, distance, estimatedTime)
        } else {
          deliveryFee = calculatedAmounts?.deliveryCharge || 0
        }
      } else {
        deliveryFee = calculatedAmounts?.deliveryCharge || 0
      }
    }

    const finalOrderTotal = discountedSubtotal + deliveryFee + platformCommission

    const allItemsWithPayloads = await Promise.all(
      pharmacyItems.map(async (item: any) => ({
        pharmacyId: item.pharmacyId.trim(),
        payload: await buildPharmacyOrderItemCreateInput(item),
      }))
    )

    let parentOrder: any = null
    const childOrders: any[] = []

    if (isMultiPharmacy) {
      let remainingDiscount = promoDiscount
      const discountByPharmacy: Record<string, number> = {}
      for (let i = 0; i < pharmacyIds.length; i++) {
        const pharmacyId = pharmacyIds[i]
        const pItems = itemsByPharmacy[pharmacyId] || []
        let pharmacySubtotal = 0
        for (const it of pItems) pharmacySubtotal += it.price * it.quantity
        const share = subtotal > 0 ? pharmacySubtotal / subtotal : 0
        const d = i === pharmacyIds.length - 1 ? remainingDiscount : Math.round(promoDiscount * share * 100) / 100
        discountByPharmacy[pharmacyId] = Math.max(0, d)
        remainingDiscount = Math.max(0, Math.round((remainingDiscount - discountByPharmacy[pharmacyId]) * 100) / 100)
      }

      const pharmacyNets = pharmacyIds.map((pid) => {
        const pItems = itemsByPharmacy[pid] || []
        let s = 0
        for (const it of pItems) s += it.price * it.quantity
        return Math.max(0, s - (discountByPharmacy[pid] || 0))
      })
      const platformParts = splitAmountByWeights(platformCommission, pharmacyNets)
      const vendorParts = splitAmountByWeights(vendorCommissionTotal, pharmacyNets)

      for (let pi = 0; pi < pharmacyIds.length; pi++) {
        const pharmacyId = pharmacyIds[pi]
        const pItems = itemsByPharmacy[pharmacyId] || []
        const pharmacy = pharmacyMap[pharmacyId]
        let pharmacySubtotal = 0
        for (const it of pItems) pharmacySubtotal += it.price * it.quantity

        const pharmacyPlatformCommission = platformParts[pi] ?? 0
        const pharmacyVendorCommission = vendorParts[pi] ?? 0
        const pharmacyDeliveryFee = subtotal > 0 ? (pharmacySubtotal / subtotal) * deliveryFee : 0
        const pharmacyDiscount = discountByPharmacy[pharmacyId] || 0
        const pharmacyTotal =
          Math.max(0, pharmacySubtotal - pharmacyDiscount) + pharmacyDeliveryFee + pharmacyPlatformCommission

        const childOrderNumber = generateOrderNumber()
        const childPayloads = allItemsWithPayloads
          .filter((x) => x.pharmacyId === pharmacyId)
          .map((x) => x.payload)

        const childOrder = await prisma.order.create({
          data: {
            orderNumber: childOrderNumber,
            customerId: user.id,
            vendorId: pharmacy.userId,
            addressId,
            module: "PHARMACY",
            status: "PENDING",
            subtotal: pharmacySubtotal,
            deliveryFee: pharmacyDeliveryFee,
            serviceFee: 0,
            tax: 0,
            discount: pharmacyDiscount,
            total: pharmacyTotal as number,
            platformCommission: pharmacyPlatformCommission,
            vendorCommission: pharmacyVendorCommission,
            paymentStatus: "PENDING",
            paymentMethod,
            notes,
            pharmacyId: pharmacy.id,
            isChildOrder: true as any,
            orderItems: {
              create: childPayloads,
            },
            orderTracking: {
              create: {
                status: "PENDING",
                notes: "Order placed successfully",
              },
            },
          },
          include: {
            orderItems: true,
            address: true,
          },
        })
        childOrders.push(childOrder)
      }

      const parentOrderNumber = generateOrderNumber()
      parentOrder = await prisma.order.create({
        data: {
          orderNumber: parentOrderNumber,
          customerId: user.id,
          vendorId: null,
          addressId,
          module: "PHARMACY",
          status: "PENDING",
          subtotal,
          deliveryFee,
          serviceFee: 0,
          tax: 0,
          discount: promoDiscount,
          total: finalOrderTotal as number,
          platformCommission,
          vendorCommission: vendorCommissionTotal,
          paymentStatus: "PENDING",
          paymentMethod,
          notes: notes || `Multi-pharmacy order from ${pharmacyIds.length} pharmacies`,
          pharmacyId: null,
          isChildOrder: false as any,
          childId: null as any,
          orderItems: {
            create: allItemsWithPayloads.map((x) => x.payload),
          },
          orderTracking: {
            create: {
              status: "PENDING",
              notes: "Order placed successfully",
            },
          },
        },
        include: {
          orderItems: true,
          address: true,
        },
      })

      await prisma.order.updateMany({
        where: { id: { in: childOrders.map((co) => co.id) } },
        data: { childId: parentOrder.id as any },
      })
    } else {
      const pid = pharmacyIds[0]
      const pharmacy = pharmacyMap[pid]
      const orderNumber = generateOrderNumber()
      const singlePayloads = allItemsWithPayloads.map((x) => x.payload)
      parentOrder = await prisma.order.create({
        data: {
          orderNumber,
          customerId: user.id,
          vendorId: pharmacy.userId,
          addressId,
          module: "PHARMACY",
          status: "PENDING",
          subtotal,
          deliveryFee,
          serviceFee: 0,
          tax: 0,
          discount: promoDiscount,
          total: finalOrderTotal as number,
          platformCommission,
          vendorCommission: vendorCommissionTotal,
          paymentStatus: "PENDING",
          paymentMethod,
          notes,
          pharmacyId: pid,
          isChildOrder: false as any,
          childId: null as any,
          orderItems: {
            create: singlePayloads,
          },
          orderTracking: {
            create: {
              status: "PENDING",
              notes: "Order placed successfully",
            },
          },
        },
        include: {
          orderItems: true,
          address: true,
        },
      })
    }

    const order = parentOrder

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

    const pickupAddress = isMultiPharmacy
      ? `Multiple pharmacies: ${pharmacies.map(p => p.pharmacyName).join(', ')}`
      : primaryPharmacy.address
    const pickupLatitude = primaryPharmacy.lat!
    const pickupLongitude = primaryPharmacy.lon!

    const courierBooking = await prisma.courierBooking.create({
      data: {
        bookingNumber: `CB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        customerId: user.id,
        orderId: order.id,
        pickupAddress,
        pickupLatitude,
        pickupLongitude,
        dropAddress: `${address.street}, ${address.city}, ${address.state}`,
        dropLatitude: dropLatitude!,
        dropLongitude: dropLongitude!,
        distance,
        estimatedTime,
        fare: deliveryFee,
        status: "REQUESTED",
        paymentStatus: "PENDING",
        paymentMethod,
        packageType: "Medicine",
        module: "PHARMACY",
        notes: notes || `Cart order: ${pharmacyItems.length} items`,
        recipientName: user.name,
        recipientPhone: user.phone!,
        rideTypeId: rideType.id
      }
    })

    // Save route data for multi-pharmacy orders (using MultiplePickup)
    if (isMultiPharmacy && routeData) {
      try {
        await saveRouteToMultiplePickups(order.id, routeData, 'PHARMACY')
        // Link MultiplePickup records to courier booking
        await prisma.multiplePickup.updateMany({
          where: { orderId: order.id },
          data: { courierBookingId: courierBooking.id },
        })
      } catch (error) {
        console.error('Error saving route data:', error)
        // Don't fail the order if route saving fails
      }
    }

    // Also create PharmacyPickup records for backward compatibility
    const pharmacyPickups = await Promise.all(
      validPharmacyIds.map(async (pharmacyId: string, index: number) => {
        const pharmacy = pharmacyMap[pharmacyId]
        const pharmacyItems = itemsByPharmacy[pharmacyId]
        
        if (!pharmacy || !pharmacyItems || !Array.isArray(pharmacyItems) || pharmacyItems.length === 0) {
          return null
        }

        return prisma.pharmacyPickup.create({
          data: {
            courierBookingId: courierBooking.id,
            pharmacyId,
            pharmacyName: pharmacy.pharmacyName,
            pharmacyAddress: pharmacy.address,
            pharmacyLatitude: pharmacy.lat || 0,
            pharmacyLongitude: pharmacy.lon || 0,
            pickupOrder: index + 1,
            items: pharmacyItems,
            status: "PENDING",
            notes: `${pharmacyItems.length} item(s) to pickup from ${pharmacy.pharmacyName}`
          }
        })
      })
    )

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
    } catch (walletErr) {
      console.error("Pharmacy checkout pending vendor wallets:", walletErr)
    }

    try {
      await ensureVendorCommissionRecordsForOrderTree(order.id)
      await ensurePlatformFeeReportingVendorCommissions(order.id)
    } catch (pcErr) {
      console.error("Pharmacy checkout vendor commission record:", pcErr)
    }

    // Find available riders with vehicle types suitable for medicine delivery
    // Filter by: SCOOTER, MOTORCYCLE, BICYCLE (light vehicles for medicine delivery)
    const radiusKm = Number(process.env.RIDER_SEARCH_RADIUS_KM || '30')
    
    const availableRiders = await prisma.riderProfile.findMany({
      where: {
        isVerified: true,
        isApproved: true,
        isAvailable: true,
        vehicleType: {
          in: ["SCOOTER", "MOTORCYCLE", "BICYCLE"]
        },
        maxDeliveryDistance: {
          gte: distance
        },
        serviceTypes: {
          path: ["MODULE_DELIVERY"],
          equals: true
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true
          }
        }
      },
      take: 20
    })

    // Rank riders by proximity to pickup location
    const ridersWithDistance = availableRiders
      .map(r => {
        const loc = (r as any).currentLocation || {}
        const lat = typeof loc.lat === 'number' ? loc.lat : (typeof loc.latitude === 'number' ? loc.latitude : undefined)
        const lng = typeof loc.lng === 'number' ? loc.lng : (typeof loc.longitude === 'number' ? loc.longitude : undefined)
        
        if (typeof lat === 'number' && typeof lng === 'number' && 
            typeof pickupLatitude === 'number' && typeof pickupLongitude === 'number') {
          const riderDistance = calculateDistance(lat, lng, pickupLatitude, pickupLongitude)
          return { rider: r, riderDistance }
        }
        return { rider: r, riderDistance: Number.POSITIVE_INFINITY }
      })
      .filter(x => Number.isFinite(x.riderDistance))
      .sort((a, b) => a.riderDistance - b.riderDistance)
      .slice(0, 20)

    // Send notifications to available riders
    const socketServer = getSocketServer()
    
    for (const { rider, riderDistance } of ridersWithDistance) {
      const pharmacyNames = pharmacies.map(p => p.pharmacyName).join(', ')
      
      await socketServer.sendNotificationToUser(rider.user.id, {
        userId: rider.user.id,
        title: "New Delivery Request",
        message: `New pharmacy order delivery. ${pharmacyIds.length > 1 ? `${pharmacyIds.length} pharmacies: ${pharmacyNames}` : `From: ${pharmacyNames}`}. Distance: ${riderDistance.toFixed(1)}km from you, Trip: ${distance.toFixed(1)}km, Fare: ₦${deliveryFee.toFixed(0)}`,
        type: "DELIVERY",
        module: "PHARMACY",
        data: { 
          courierBookingId: courierBooking.id,
          orderId: order.id,
          distance,
          fare: deliveryFee,
          estimatedArrivalMinutes: estimatedTime,
          pharmacyCount: pharmacyIds.length,
          pharmacyNames,
          pickupDistanceKm: riderDistance
        },
        actionUrl: `/rider/deliveries/${courierBooking.id}`
      })

      await socketServer.sendNewRideToUser(rider.user.id, {
        bookingId: courierBooking.id,
        orderId: order.id,
        pickup: { lat: pickupLatitude, lng: pickupLongitude },
        dropoff: { lat: dropLatitude, lng: dropLongitude },
        fare: deliveryFee,
        distanceKm: distance,
        estimatedArrivalMinutes: estimatedTime,
        pharmacyCount: pharmacyIds.length,
        pharmacyNames,
        multiplePickups: pharmacyIds.length > 1
      })
    }

    // Send notifications to pharmacies (child order per pharmacy when multi)
    for (const pharmacy of pharmacies) {
      const pharmacyItemsList = itemsByPharmacy[pharmacy.id]
      const targetOrder = isMultiPharmacy
        ? childOrders.find((co) => co.pharmacyId === pharmacy.id)
        : order
      const displayNumber = targetOrder?.orderNumber ?? order.orderNumber
      await socketServer.sendNotificationToUser(pharmacy.userId, {
        userId: pharmacy.userId,
        title: "New Order Received",
        message: `New order #${displayNumber} with ${pharmacyItemsList.length} items`,
        type: "ORDER",
        module: "PHARMACY",
        data: {
          orderId: targetOrder?.id ?? order.id,
          orderNumber: displayNumber,
          itemCount: pharmacyItemsList.length,
          customerName: user.name
        },
        actionUrl: `/pharmacy/orders/${targetOrder?.id ?? order.id}`
      })
    }

    const customerRow = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, name: true },
    })
    if (customerRow?.email) {
      try {
        let tmpl = await prisma.emailTemplate.findFirst({
          where: {
            isActive: true,
            category: "ORDER_CONFIRMATION",
            module: "PHARMACY",
          },
          orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        })
        if (!tmpl) {
          tmpl = await prisma.emailTemplate.findFirst({
            where: {
              isActive: true,
              category: "ORDER_CONFIRMATION",
              module: "GLOBAL",
            },
            orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
          })
        }
        if (tmpl) {
          await sendEmailFromTemplate(customerRow.email, tmpl.templateKey, {
            customerName: customerRow.name || "Customer",
            orderNumber: order.orderNumber,
            orderId: order.id,
            total: String(finalOrderTotal),
            subtotal: String(subtotal),
            discount: String(promoDiscount),
            deliveryFee: String(deliveryFee),
            pharmacyNames: pharmacies.map((p) => p.pharmacyName).join(", "),
            appName: process.env.APP_NAME || "Killo",
          })
        }
      } catch (emailErr) {
        console.error("Pharmacy order confirmation email:", emailErr)
      }
    }

    return NextResponse.json({
      success: true,
      message: "Order placed successfully",
      data: {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          total: finalOrderTotal,
          subtotal: order.subtotal,
          deliveryFee,
          isChildOrder: order.isChildOrder,
          childId: order.childId,
          childOrders: isMultiPharmacy
            ? childOrders.map((co) => ({
                id: co.id,
                orderNumber: co.orderNumber,
                vendorId: co.vendorId,
                total: co.total,
                pharmacyId: co.pharmacyId,
              }))
            : undefined,
        },
        courierBooking: {
          id: courierBooking.id,
          bookingNumber: courierBooking.bookingNumber,
          distance,
          fare: deliveryFee,
          estimatedTime,
          pickupAddress: courierBooking.pickupAddress,
          dropAddress: courierBooking.dropAddress,
          pickupLatitude: courierBooking.pickupLatitude,
          dropLatitude: courierBooking.dropLatitude,
          pickupLongitude: courierBooking.pickupLongitude,
          dropLongitude: courierBooking.dropLongitude,
        },
        trackingScreen: "DeliveryTracking",
        trackingParams: {
          bookingId: courierBooking.id,
          bookingType: "courier",
        },
        pharmacyPickups: pharmacyPickups.filter(p => p !== null).map(p => ({
          id: p!.id,
          pharmacyId: p!.pharmacyId,
          pharmacyName: p!.pharmacyName,
          pickupOrder: p!.pickupOrder,
          itemCount: Array.isArray(p!.items) ? p!.items.length : 0,
          status: p!.status
        })),
        pharmacyCount: pharmacyIds.length,
        multiplePharmacies: pharmacyIds.length > 1,
        availableRiders: availableRiders.length
      }
    })

  } catch (error: any) {
    console.error("Cart checkout error:", error)
    return NextResponse.json(
      { error: "Failed to process checkout", details: error.message },
      { status: 500 }
    )
  }
}

// Helper function to calculate distance between two points (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  const distance = R * c // Distance in kilometers
  
  return distance
}

// Resolve coordinates from address string or object
async function resolveCoordinates(
  address: any,
  apiKey?: string
): Promise<{ latitude: number; longitude: number; fullAddress?: string }> {
  // If object with coordinates provided, use directly
  if (address && typeof address === 'object') {
    const lat = address.latitude ?? address.lat
    const lng = address.longitude ?? address.lng
    if (typeof lat === 'number' && typeof lng === 'number') {
      return { latitude: lat, longitude: lng, fullAddress: address.fullAddress || address.address }
    }
  }
  
  // If string and API key available, geocode
  if (typeof address === 'string' && apiKey) {
    try {
      const params = new URLSearchParams({ address, key: apiKey })
      const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        const loc = data?.results?.[0]?.geometry?.location
        if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
          return { latitude: loc.lat, longitude: loc.lng, fullAddress: data?.results?.[0]?.formatted_address }
        }
      }
    } catch (err) {
      console.error('Geocoding error:', err)
    }
  }
  
  // Fallback to 0,0 (should be handled by caller)
  return { latitude: 0, longitude: 0, fullAddress: typeof address === 'string' ? address : address?.fullAddress }
}

