import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getSocketServer } from "@/lib/socket-init"
import { createVendorCommission } from "@/lib/commission-service"
import { processPharmacyPayment } from "@/lib/pharmacy-payment-service"


export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR" as any) {
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
      pharmacyAddress,
      vehicleType,
      rideTypeId,
      paymentMethod,
      deliveryAddress,
      wholesalerAddress,
      calculatedAmounts,
      paymentData // Payment data from PaymentScreen (when payment succeeds)
    } = body as any

    // Get the supplier order
    const supplierOrder = await prisma.supplierOrder.findUnique({
      where: { 
        id: params.id,
        pharmacyId: pharmacy.id,
        
      },
      include: {
        wholesaler: {
          select: {
            id: true,
            companyName: true,
            userId: true,
            address: true
          }
        },
        items: true,
      }
    })
    
    
    if (!supplierOrder) {
      return NextResponse.json(
        { error: "Quote not found or not accepted by wholesaler" },
        { status: 404 }
      )
    }
    
    // Validate required fields
    if (!pharmacyAddress || !vehicleType || !paymentMethod || !rideTypeId) {
      return NextResponse.json(
        { error: "Pharmacy address, vehicle type, and payment method are required" },
        { status: 400 }
      )
    }

    // Validate that frontend calculations are provided (required)
    if (!calculatedAmounts || !calculatedAmounts.deliveryCharge || !calculatedAmounts.distance) {
      return NextResponse.json(
        { error: "Calculated amounts from frontend are required. Please ensure distance and delivery charge are calculated." },
        { status: 400 }
      )
    }

    // Use pre-calculated data from mobile app (distanceService) - all calculations done in frontend
    const distance = calculatedAmounts.distance
    const riderFare = calculatedAmounts.deliveryCharge
    const estimatedArrivalMinutes = calculatedAmounts.estimatedArrivalMinutes || 0
    const driverSpeed = calculatedAmounts.driverSpeed

    // Get coordinates from frontend calculations
    const pharmacyCoords = calculatedAmounts.pharmacyCoordinates || {
      latitude: typeof pharmacyAddress === 'object' ? (pharmacyAddress.latitude || 0) : 0,
      longitude: typeof pharmacyAddress === 'object' ? (pharmacyAddress.longitude || 0) : 0
    }

    const wholesalerCoords = calculatedAmounts.wholesalerCoordinates || 
      (wholesalerAddress && wholesalerAddress.latitude && wholesalerAddress.longitude ? {
        latitude: wholesalerAddress.latitude,
        longitude: wholesalerAddress.longitude
      } : {
        latitude: 0,
        longitude: 0
      })

    console.log("📱 Using frontend calculations:", {
      distance,
      riderFare,
      estimatedArrivalMinutes,
      driverSpeed,
      pharmacyCoords,
      wholesalerCoords
    })


    // Enforce configurable search radius (default 30km)
    const radiusKm = Number(process.env.RIDER_SEARCH_RADIUS_KM || '30')
    
    if (Number.isFinite(radiusKm) && distance > radiusKm) {
      return NextResponse.json(
        { error: `Delivery distance ${distance.toFixed(1)}km exceeds service radius ${radiusKm}km` },
        { status: 400 }
      )
    }

    // Find available riders
    const availableRiders = await prisma.riderProfile.findMany({
      where: {
        isVerified: true,
        isApproved: true,
        isAvailable: true,
        
        maxDeliveryDistance: {
          gte: distance
        },
        serviceTypes: {
          path: ["MODULE_DELIVERY"],
          equals: true, // because value stored is `true`
        },

        vehicleType: vehicleType
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true
          }
        }
      }
    })
    
    // Rank riders by proximity to pickup (wholesaler) using currentLocation
    const ridersWithDistance = availableRiders.map(r => {
      const loc = (r as any).currentLocation || {}
      
      const lat = typeof loc.lat === 'number' ? loc.lat : (typeof loc.latitude === 'number' ? loc.latitude : undefined)
      const lng = typeof loc.lng === 'number' ? loc.lng : (typeof loc.longitude === 'number' ? loc.longitude : undefined)
      // console.log("riderDistance", lat, lng, wholesalerCoords.latitude, wholesalerCoords.longitude)
      
      // Ensure we have valid coordinates before calling calculateDistance
      if (typeof lat === 'number' && typeof lng === 'number' && 
          typeof wholesalerCoords.latitude === 'number' && typeof wholesalerCoords.longitude === 'number') {
        const riderDistance = calculateDistance(lat, lng, wholesalerCoords.latitude, wholesalerCoords.longitude)
        return { rider: r, riderDistance }
      } else {
        return { rider: r, riderDistance: Number.POSITIVE_INFINITY }
      }
    })
      .filter(x => Number.isFinite(x.riderDistance))
      .sort((a, b) => a.riderDistance - b.riderDistance)

    // Optionally cap to nearest 20
    const nearestRiders = ridersWithDistance.slice(0, 20)
    

    // console.log("nearestRiders", nearestRiders.map(n => ({ id: n.rider.id, km: n.riderDistance })))
    // if (nearestRiders.length === 0) {
    //   return NextResponse.json(
    //     { error: "No available riders found near pickup for the selected vehicle type and distance" },
    //     { status: 404 }
    //   )
    // }

    // Create courier booking
    const pickupAddressText = typeof supplierOrder.wholesaler.address === 'string'
      ? supplierOrder.wholesaler.address
      : (supplierOrder.wholesaler.address && (supplierOrder.wholesaler.address as any).fullAddress) || "Wholesaler Address"

      const packageWeight = (supplierOrder.supplierResponse as any)?.orderWeight || 0;


    const dropAddressText = typeof deliveryAddress === 'string'
      ? deliveryAddress
      : ((deliveryAddress as any)?.fullAddress || (typeof pharmacyAddress === 'string' ? pharmacyAddress : (pharmacyAddress as any)?.fullAddress) || 'Pharmacy Address')


    const courierBooking = await prisma.courierBooking.create({
      data: {
        bookingNumber: `CB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        customerId: pharmacy.userId,
        pickupAddress: pickupAddressText,
        pickupLatitude: wholesalerCoords.latitude,
        pickupLongitude: wholesalerCoords.longitude,
        dropAddress: dropAddressText,
        dropLatitude: pharmacyCoords.latitude,
        dropLongitude: pharmacyCoords.longitude,
        distance: distance,
        estimatedTime: estimatedArrivalMinutes, // Use frontend-calculated estimate
        fare: riderFare,
        status: "REQUESTED",
        paymentStatus: "PENDING",
        paymentMethod: paymentMethod === "PAY_NOW" ? "CARD" : paymentMethod,
        packageType: "Medicine",
        notes: `Medicine delivery from ${supplierOrder.wholesaler.companyName}${driverSpeed ? ` (Driver speed: ${driverSpeed.toFixed(1)} km/h)` : ''}`,
        recipientName: pharmacy.pharmacyName,
        recipientPhone: pharmacy.phone,
        packageWeight: packageWeight,
        rideTypeId: rideTypeId,
        module: 'WHOLESALER',

      }
    })

    // Get order amount (excluding delivery fee)
    const orderAmount = calculatedAmounts.orderAmount || supplierOrder.totalAmount || 0
    const deliveryFee = calculatedAmounts.deliveryCharge || riderFare
    const platformFee = calculatedAmounts.platformFee || 0
    const totalAmount = calculatedAmounts.totalAmount || (orderAmount + deliveryFee + platformFee)

    // Fetch WHOLESALE_ORDER commission rate from commissionSetting
    // This is the tax/commission applied to wholesaler earnings
    let wholesalerCommissionRate = 0
    let wholesalerCommissionAmount = 0
    try {
      const { calculateCommission } = await import("@/lib/commission-service")
      const wholesalerCommissionCalc = await calculateCommission(
        "WHOLESALER",
        orderAmount,
        "WHOLESALE_ORDER"
      )
      wholesalerCommissionRate = wholesalerCommissionCalc.commissionRate
      wholesalerCommissionAmount = wholesalerCommissionCalc.commissionAmount
    } catch (error: any) {
      console.error("⚠️ Error fetching WHOLESALE_ORDER commission:", error)
      // Continue with 0 commission if setting not found
    }

    // Calculate vendor earnings (order amount minus commissions)
    // Wholesaler receives: orderAmount - platformFee - wholesalerCommission
    const wholesalerEarnings = orderAmount - platformFee - wholesalerCommissionAmount

    // Process payment and wallet transactions if payment succeeded
    console.log("paymentData 11", paymentData)
    let paymentProcessed = false
    if (paymentData && paymentData.status === 'PAID') {
      try {
        await prisma.$transaction(async (tx) => {
          // Process payment for wholesaler
          await processPharmacyPayment({
            tx,
            paymentData,
            orderId: params.id,
            orderNumber: supplierOrder.orderNumber || undefined,
            customerId: pharmacy.userId,
            vendorId: supplierOrder.wholesaler.userId,
            vendorEarnings: wholesalerEarnings,
            commissions: {
              vendorCommission: wholesalerCommissionAmount,
              vendorCommissionRate: wholesalerCommissionRate,
              platformCommission: platformFee,
            },
            module: 'WHOLESALER',
            metadata: {
              wholesalerId: supplierOrder.wholesaler.id,
              pharmacyId: pharmacy.id,
              deliveryFee,
            }
          })
        })
        paymentProcessed = true
        console.log("✅ Payment processed and wallet transaction created (PENDING)")
      } catch (paymentError: any) {
        console.error("⚠️ Payment processing error:", paymentError)
        // Don't fail the order if payment processing fails, but log it
      }
    }

    // Create commissions using commission-service (all PENDING until rider completes order)
    // Note: orderId is not passed since VendorCommission.orderId only accepts Order model IDs, not SupplierOrder IDs
    // Commissions can be queried by vendorId + module + commissionType + createdAt
    try {
      // 1. WHOLESALER module, PLATFORM_FEE commission (based on order amount)
      await createVendorCommission({
        module: "WHOLESALER",
        vendorId: supplierOrder.wholesaler.userId,
        orderAmount: orderAmount,
        commissionType: "PLATFORM_FEE",
        status: "PENDING"
      })

      // 2. PHARMACY module, WHOLESALE_ORDER commission (based on order amount)
      await createVendorCommission({
        module: "PHARMACY",
        vendorId: pharmacy.userId,
        orderAmount: orderAmount,
        commissionType: "WHOLESALE_ORDER",
        status: "PENDING"
      })

      // 3. WHOLESALER module, WHOLESALE_ORDER commission (based on order amount)
      // This is the commission/tax deducted from wholesaler earnings (already calculated above)
      await createVendorCommission({
        module: "WHOLESALER",
        vendorId: supplierOrder.wholesaler.userId,
        orderAmount: orderAmount,
        commissionType: "WHOLESALE_ORDER",
        status: "PENDING"
      })

      // 4. RIDING module, RIDER_COMMISSION commission (based on delivery fee)
      // Note: This will be created when rider accepts the booking
      // The riderId will be set when rider accepts
      console.log("✅ Commissions created successfully (PENDING status)")
    } catch (commissionError: any) {
      console.error("⚠️ Commission creation error:", commissionError)
      // Don't fail the order if commission creation fails, but log it
    }

    // Update supplier order with courier booking and address details
    const updatedOrder = await prisma.supplierOrder.update({
      where: { id: params.id },
      data: {
        status: "CONFIRMED",
        pharmacyAcceptance: true,
        courierBookingId: courierBooking.id,
        deliveryAddress: deliveryAddress || (typeof pharmacyAddress === 'string' ? pharmacyAddress : pharmacyAddress.fullAddress),
        deliveryLatitude: typeof pharmacyAddress === 'string' ? pharmacyCoords.latitude : pharmacyAddress.latitude,
        deliveryLongitude: typeof pharmacyAddress === 'string' ? pharmacyCoords.longitude : pharmacyAddress.longitude,
        pickupAddress: wholesalerAddress?.fullAddress || supplierOrder.wholesaler.address,
        pickupLatitude: wholesalerAddress?.latitude || wholesalerCoords.latitude,
        pickupLongitude: wholesalerAddress?.longitude || wholesalerCoords.longitude,
        currency: calculatedAmounts.currency || supplierOrder.currency,
        isQuote: false,

        // Set payment status to PAID if payment succeeded, otherwise PENDING
        paymentStatus: (paymentData && paymentData.status === 'PAID') ? "PAID" : "PENDING"
      },
      include: {
        wholesaler: {
          select: {
            id: true,
            companyName: true,
            userId: true
          }
        },
        pharmacy: {
          select: {
            id: true,
            pharmacyName: true,
            userId: true
          }
        },
        courierBooking: true,
        items: true,
      }
    })

    // Send notifications to available riders
    const { NotificationBridge } = await import("@/lib/notification-bridge")
    
    console.log("🚚 Sending notifications to riders:", nearestRiders.length);
    
    // Debug: List all connected users before sending notifications
    const socketServer = getSocketServer();
    console.log("🔍 Socket server stats:", socketServer.getStats());
    console.log("🔍 Connected users before sending notifications:");
    const connectedUsers = socketServer.listConnectedUsers();
    console.log("🔍 Connected users:", connectedUsers);
    
    for (const { rider, riderDistance } of nearestRiders) {
      console.log("🚚 Processing rider:", {
        riderId: rider.id,
        userId: rider.user.id,
        userName: rider.user.name,
        riderDistance: riderDistance
      });
      
      console.log("🚚 About to send notification to userId:", rider.user.id);
      
      await socketServer.sendNotificationToUser(rider.user.id, {
        userId: rider.user.id,
        title: "New Delivery Request",
        message: `New medicine delivery request from ${pharmacy.pharmacyName}. Pickup distance from you: ${riderDistance.toFixed(1)}km, Trip: ${distance.toFixed(1)}km, Fare: ₦${riderFare.toFixed(0)}${driverSpeed ? `, ETA: ${estimatedArrivalMinutes}min (GPS speed: ${driverSpeed.toFixed(1)}km/h)` : `, ETA: ${estimatedArrivalMinutes}min`}`,
        type: "DELIVERY",
        module: "PHARMACY",
        data: { 
          courierBookingId: courierBooking.id,
          distance,
          fare: riderFare,
          estimatedArrivalMinutes,
          driverSpeed,
          pharmacyName: pharmacy.pharmacyName,
          wholesalerName: supplierOrder.wholesaler.companyName,
          pickupDistanceKm: riderDistance
        },
        actionUrl: `/rider/deliveries/${courierBooking.id}`
      })

      await socketServer.sendNewRideToUser(rider.user.id, {
        bookingId: courierBooking.id,
        pickup: { lat: wholesalerCoords.latitude, lng: wholesalerCoords.longitude },
        dropoff: { lat: pharmacyCoords.latitude, lng: pharmacyCoords.longitude },
        fare: riderFare,
        distanceKm: distance,
        estimatedArrivalMinutes: estimatedArrivalMinutes,
        driverSpeed: driverSpeed,
        pharmacyName: pharmacy.pharmacyName,
        wholesalerName: supplierOrder.wholesaler.companyName,
      });
      
    }

    // Send notification to wholesaler
    await socketServer.sendNotificationToUser(supplierOrder.wholesaler.userId, {
      userId: supplierOrder.wholesaler.userId,
      title: "Order Confirmed Waiting for Rider",
      message: `${pharmacy.pharmacyName} has confirmed the order and delivery is being arranged`,
      type: "ORDER_UPDATE",
      module: "PHARMACY",
      actionUrl: `/wholesaler/orders/${supplierOrder.id}`,
      data: {
        actionType: "navigate",
        screen: 'WholesalerOrders',
        params: [
          { name: 'orderId', value: supplierOrder.id },
        ],
        orderId: supplierOrder.id,
        pharmacyName: pharmacy.pharmacyName
      }
    })



    return NextResponse.json({
      message: "Order confirmed and delivery arranged successfully",
      order: {
        id: updatedOrder.id,
        status: updatedOrder.status,
        courierBooking: {
          id: courierBooking.id,
          bookingNumber: courierBooking.bookingNumber,
          distance,
          fare: riderFare,
          estimatedTime: courierBooking.estimatedTime,
          estimatedArrivalMinutes: estimatedArrivalMinutes,
          driverSpeed: driverSpeed
        },
        availableRiders: availableRiders.length,
        calculations: {
          source: "frontend",
          driverSpeed: driverSpeed,
          estimatedArrivalMinutes: estimatedArrivalMinutes
        }
      }
    })

  } catch (error) {
    console.error("Order confirmation error:", error)
    return NextResponse.json(
      { error: "Failed to confirm order" },
      { status: 500 }
    )
  }
}

// Helper function to calculate distance between two points (used only for rider proximity ranking)
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
