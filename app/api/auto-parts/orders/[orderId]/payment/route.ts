import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getGlobalSocketServer } from "@/lib/socket-server"

// Helper function to calculate distance (Haversine formula) - fallback if Google Maps API fails
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

// Helper function to get driving distance using Google Maps API (same as calculate-fare route)
async function getDrivingDistance(
  originLat: number, 
  originLng: number, 
  destLat: number, 
  destLng: number
): Promise<{ distance: number; duration: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    console.error("Google Maps API key not configured")
    return null
  }

  try {
    const origin = `${originLat},${originLng}`
    const destination = `${destLat},${destLng}`
    
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&units=metric&key=${apiKey}`
    
    const response = await fetch(url)
    if (!response.ok) {
      console.error("Distance Matrix API error:", response.status)
      return null
    }

    const data = await response.json()
    
    if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
      const element = data.rows[0].elements[0]
      return {
        distance: element.distance.value / 1000, // Convert meters to kilometers
        duration: element.duration.value // Duration in seconds
      }
    }
    
    return null
  } catch (error) {
    console.error("Error calling Distance Matrix API:", error)
    return null
  }
}

// Helper function to calculate fare (same as calculate-fare route)
function calculateFare(rideType: any, distanceKm: number, durationSeconds: number): number {
  const durationMinutes = durationSeconds / 60
  
  let fare = rideType.basePrice
  
  // Add distance-based pricing
  fare += distanceKm * rideType.pricePerKm
  
  // Add time-based pricing if applicable
  if (rideType.pricePerMinute > 0) {
    fare += durationMinutes * rideType.pricePerMinute
  }
  
  // Round to 2 decimal places
  return Math.round(fare * 100) / 100
}

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { orderId } = params
    const body = await request.json()
    const { 
      paymentMethod,
      paymentData,
      courierRideTypeId, // Optional: rideTypeId for courier booking
      deliveryFee: providedDeliveryFee // Optional: pre-calculated delivery fee
    } = body

    // Get the order with related data
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        vendor: {
          include: {
            vendorProfile: {
              select: {
                businessName: true,
                latitude: true,
                longitude: true,
                address: true,
              }
            }
          }
        },
        address: true,
      }
    })

    // Get part request separately if partRequestId exists
    let partRequest: any = null
    if ((order as any).partRequestId) {
      partRequest = await prisma.partRequest.findUnique({
        where: { id: (order as any).partRequestId }
      })
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Verify customer owns the order
    if (order.customerId !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    // Check if order is already paid
    if (order.paymentStatus === "PAID") {
      return NextResponse.json({ 
        error: "Order is already paid",
        data: { order }
      }, { status: 400 })
    }

    // Get system settings for currency
    const settings = await prisma.systemSettings.findFirst({
      orderBy: { createdAt: 'desc' }
    })

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Create payment record
      if (paymentData) {
        await tx.payment.create({
          data: {
            userId: user.id,
            orderId: order.id,
            amount: order.total,
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
        await tx.order.update({
          where: { id: order.id },
          data: { 
            paymentStatus: 'PAID',
            paymentMethod: paymentMethod || 'CARD',
          }
        })
      }

      // Create courier booking if no mechanic is needed and payment succeeded
      let courierBooking: any = null
      const needsMechanic = partRequest?.needsMechanic || false
      const orderWithRelations = order as any

      if (!needsMechanic && paymentData?.status === 'succeeded' && orderWithRelations.address && orderWithRelations.vendor?.vendorProfile?.latitude && orderWithRelations.vendor?.vendorProfile?.longitude) {
        // Get courier ride type (use provided rideTypeId or fetch default)
        let courierRideType: any = null
        if (courierRideTypeId) {
          courierRideType = await tx.rideType.findUnique({
            where: {
              id: courierRideTypeId,
              category: "COURIER",
              isActive: true
            }
          })
        }
        
        if (!courierRideType) {
          // Get default courier ride type
          courierRideType = await tx.rideType.findFirst({
            where: {
              category: "COURIER",
              isActive: true
            },
            orderBy: { basePrice: 'asc' }
          })
        }

        if (courierRideType) {
          // Use provided delivery fee or calculate using Google Maps API (same as calculate-fare route)
          let fare = providedDeliveryFee || 0
          let distance = 0
          let estimatedTime = 0
          
          if (!providedDeliveryFee) {
            // Calculate distance using Google Maps API (same as calculate-fare route)
            const distanceData = await getDrivingDistance(
              orderWithRelations.vendor.vendorProfile.latitude,
              orderWithRelations.vendor.vendorProfile.longitude,
              orderWithRelations.address.latitude,
              orderWithRelations.address.longitude
            )
            
            if (distanceData) {
              distance = distanceData.distance
              estimatedTime = Math.ceil(distanceData.duration / 60) // Convert seconds to minutes
              fare = calculateFare(courierRideType, distance, distanceData.duration)
            } else {
              // Fallback to Haversine formula if Google Maps API fails
              distance = calculateDistance(
                orderWithRelations.vendor.vendorProfile.latitude,
                orderWithRelations.vendor.vendorProfile.longitude,
                orderWithRelations.address.latitude,
                orderWithRelations.address.longitude
              )
              estimatedTime = Math.ceil(distance * 3) // 3 minutes per km
              fare = calculateFare(courierRideType, distance, estimatedTime * 60)
            }
          } else {
            // If delivery fee is provided, estimate distance for booking record
            distance = (providedDeliveryFee - (courierRideType.basePrice || 3.0)) / (courierRideType.pricePerKm || 1.5)
            estimatedTime = Math.ceil(distance * 3)
          }

          courierBooking = await tx.courierBooking.create({
            data: {
              bookingNumber: `CB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              customerId: user.id,
              orderId: order.id,
              rideTypeId: courierRideType.id,
              pickupAddress: orderWithRelations.vendor.vendorProfile.address || "Vendor Location",
              pickupLatitude: orderWithRelations.vendor.vendorProfile.latitude,
              pickupLongitude: orderWithRelations.vendor.vendorProfile.longitude,
              dropAddress: `${orderWithRelations.address.street}, ${orderWithRelations.address.city}, ${orderWithRelations.address.state}`,
              dropLatitude: orderWithRelations.address.latitude,
              dropLongitude: orderWithRelations.address.longitude,
              distance,
              estimatedTime,
              fare,
              status: "REQUESTED",
              paymentStatus: "PENDING",
              paymentMethod: paymentMethod || "CARD",
              packageType: "Auto Parts",
              notes: `Auto parts delivery for order ${order.orderNumber}`,
              recipientName: user.name,
              recipientPhone: user.phone || undefined,
            }
          })

          // Create initial tracking update
          await tx.courierTracking.create({
            data: {
              bookingId: courierBooking.id,
              status: "REQUESTED",
              notes: "Booking created, looking for nearby riders"
            }
          })

          // Update order delivery fee and total (including commission)
          const platformCommissionRate = 3.0 // Default platform commission rate
          const platformCommission = (order.subtotal * platformCommissionRate) / 100
          
          await tx.order.update({
            where: { id: order.id },
            data: {
              deliveryFee: fare,
              platformCommission: platformCommission,
              total: order.subtotal + fare + platformCommission,
            }
          })
        }
      }

      // Reload order with updated data
      const updatedOrder = await tx.order.findUnique({
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

      return { order: updatedOrder!, courierBooking }
    })

    // Send notifications
    const socketServer = getGlobalSocketServer()
    const { NotificationBridge } = await import("@/lib/notification-bridge")
    
    // Notify customer
    await NotificationBridge.sendNotification({
      userId: user.id,
      title: 'Payment Successful',
      message: `Your payment for order #${result.order.orderNumber} has been processed successfully.`,
      type: 'PAYMENT_SUCCESS',
      module: 'AUTO_PARTS',
      actionUrl: `/auto-parts/orders/${result.order.id}`,
      data: {
        actionType: 'navigate',
        screen: 'order-details',
        params: {
          orderId: result.order.id,
        },
        orderNumber: result.order.orderNumber,
      }
    })

    // Notify vendor
    if (result.order.vendorId) {
      await NotificationBridge.sendNotification({
        userId: result.order.vendorId,
        title: 'Order Paid',
        message: `Order #${result.order.orderNumber} has been paid. Please prepare the parts for delivery.`,
        type: 'ORDER_PAID',
        module: 'AUTO_PARTS',
        actionUrl: `/auto-parts/orders/${result.order.id}`,
        data: {
          actionType: 'navigate',
          screen: 'vendor-order-details',
          params: {
            orderId: result.order.id,
          },
          orderNumber: result.order.orderNumber,
        }
      })
    }

    // Notify about courier booking if created
    if (result.courierBooking) {
      const booking = result.courierBooking as any
      socketServer?.sendNotificationToUser(user.id, {
        type: 'notification',
        title: 'Courier Booking Created',
        message: `Your parts will be delivered via courier. Booking #${booking.bookingNumber}`,
        orderId: result.order.id
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        order: result.order,
        courierBooking: result.courierBooking,
        message: `Payment processed successfully. ${result.courierBooking ? 'Courier booking created.' : ''}`
      }
    })

  } catch (error: any) {
    console.error("Payment processing error:", error)
    return NextResponse.json(
      { error: "Failed to process payment", details: error.message },
      { status: 500 }
    )
  }
}

