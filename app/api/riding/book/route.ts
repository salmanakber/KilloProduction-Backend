import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"
import { calculateFare as calculateFareService } from "@/lib/fare-calculation-service"
import { checkoutPlatformFeeAmount } from "@/lib/commission-service"

const RIDE_REQUEST_MAX_AGE_MS = 90 * 1000
const NON_RIDE_REQUEST_MAX_AGE_MS = 90 * 60 * 1000
const DISPATCH_LOCK_SECONDS = 18
const DISPATCH_WAVE_SIZE = 5
const RIDE_FIRST_WAVE_MS = 45 * 1000
const dispatchTimers = new Map<string, NodeJS.Timeout[]>()
const ACTIVE_ASSIGNABLE_STATUSES = ["REQUESTED", "BIDDING"] as const
const RIDER_ACTIVE_BOOKING_STATUSES = [
  "ACCEPTED",
  "RIDER_ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "EN_ROUTE_TO_DROPOFF",
  "ARRIVED_AT_DROPOFF",
] as const

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    const {
      rideTypeId,
      pickupAddress,
      pickupLatitude,
      pickupLongitude,
      dropAddress,
      dropLatitude,
      dropLongitude,
      passengerCount = 1,
      passengerPhone,
      specialRequests,
      packageType,
      packageWeight,
      isFragile = false,
      recipientName,
      recipientPhone,
      scheduledAt,
      paymentMethod = "CASH",
      paymentData,
      promoCodeId,
      promoCodeDiscount,
      module,
      // Optional pre-calculated estimation from client to avoid re-calling fare service
      estimation,
    } = data
    const normalizedModule = String(module || "").toUpperCase()
    const courierModule =
      normalizedModule.length > 0 ? normalizedModule : "RIDE"

// console.log('💰 paymentData', paymentData)

    console.log("data", data)
    // Validate required fields
    if (!rideTypeId || !pickupAddress || !dropAddress || 
        !pickupLatitude || !pickupLongitude || !dropLatitude || !dropLongitude) {
          
      return NextResponse.json({ 
        
        error: "Missing required fields: rideTypeId, pickupAddress, dropAddress, coordinates" 
      }, { status: 400 })
    }


    // Get ride type details
    const rideType = await prisma.rideType.findUnique({
      where: { id: rideTypeId }
    })
 

    if (!rideType) {
      
      return NextResponse.json({ error: "Invalid ride type" }, { status: 400 })
    }

    // Use existing estimation from client if provided, otherwise calculate on server
    let distanceData: { distance: number; duration: number }
    let estimatedFare: number
    if (estimation && typeof estimation.distance === "number" && typeof estimation.duration === "number" && typeof estimation.fare === "number") {
      distanceData = {
        distance: Number(estimation.distance),
        duration: Number(estimation.duration),
      }
      estimatedFare = Number(estimation.fare)
    } else {
      // Calculate distance and fare using shared fare calculation service
      const fareResult = await calculateFareService({
        originLatitude: pickupLatitude,
        originLongitude: pickupLongitude,
        destinationLatitude: dropLatitude,
        destinationLongitude: dropLongitude,
        rideTypeId,
      })

      distanceData = {
        distance: fareResult.distance,
        duration: fareResult.duration,
      }

      estimatedFare = fareResult.fare
    }
    const bookingNumber = generateBookingNumber(rideType.category)

    // Handle promo code validation and discount application
    let finalFare = estimatedFare
    let validatedPromoCode: { id: string } | null = null
    if (promoCodeId && promoCodeDiscount) {
      // Validate promo code
      const promoCode = await prisma.promoCode.findUnique({
        where: { id: promoCodeId },
      })

      if (promoCode && promoCode.isActive) {
        const now = new Date()
        if (now >= promoCode.startsAt && now <= promoCode.expiresAt) {
          if (!promoCode.usageLimit || promoCode.usedCount < promoCode.usageLimit) {
            const modules = promoCode.modules as string[] | null
            if (!modules || modules.length === 0 || modules.includes('RIDING')) {
              validatedPromoCode = { id: promoCode.id }
              finalFare = Math.max(0, estimatedFare - promoCodeDiscount)
            }
          }
        }
      }
    }

    const platformFee = await checkoutPlatformFeeAmount("RIDING", finalFare)
    const payableTotal = Math.round((finalFare + platformFee) * 100) / 100
    const normalizedPaymentMethod = String(paymentMethod || "").toUpperCase()
    if (!["CARD", "WALLET"].includes(normalizedPaymentMethod)) {
      return NextResponse.json({
        error: "Only card or wallet payments are supported for this booking flow",
      }, { status: 400 })
    }

    // Handle payment validation for wallet and card payments
    if (normalizedPaymentMethod === 'WALLET' || normalizedPaymentMethod === 'CARD') {
      if (!paymentData) {
        return NextResponse.json({ 
          error: "Payment data is required" 
        }, { status: 400 })
      }

      // Validate payment amount matches final fare (after promo discount)
      const processingFee = Math.max(0, Number(paymentData.paymentProcessingFee || 0))
      const expectedPaymentTotal = Math.round((payableTotal + processingFee) * 100) / 100
      if (Math.abs(Number(paymentData.amount) - expectedPaymentTotal) > 0.01) {
        return NextResponse.json({ 
          error: "Payment amount does not match payable total" 
        }, { status: 400 })
      }

      // Validate payment status
      if (paymentData.status !== 'succeeded' && paymentData.status !== 'PAID') {
        return NextResponse.json({ 
          error: "Payment not successful" 
        }, { status: 400 })
      }

      // Wallet-specific validation
      if (normalizedPaymentMethod === 'WALLET' && (!paymentData.walletTransaction || !paymentData.transaction)) {
        return NextResponse.json({ 
          error: "Wallet transaction data is required for wallet payments" 
        }, { status: 400 })
      }

      // Card payment validation (saved or new)
      if (normalizedPaymentMethod === 'CARD') {
        // Saved card should have paymentId, new card should have id (PaymentIntent ID)
        if (!paymentData.paymentId && !paymentData.id) {
          return NextResponse.json({ 
            error: "Payment ID is required for card payments" 
          }, { status: 400 })
        }
      }
    }

    // Use transaction to ensure atomicity
    let booking
    try {
      booking = await prisma.$transaction(async (tx) => {
        // Determine which booking table to use based on ride type category
        if (rideType.category === 'RIDE') {
          const newBooking = await tx.rideBooking.create({
            data: {
              bookingNumber,
              customerId: user.id,
              rideTypeId,
              pickupAddress,
              pickupLatitude,
              pickupLongitude,
              dropAddress,
              dropLatitude,
              dropLongitude,
              distance: distanceData.distance,
              estimatedTime: Math.ceil(distanceData.duration / 60),
              estimatedFare,
              finalFare: finalFare,
              passengerCount,
              passengerPhone,
              specialRequests,
              packageType,
              packageWeight,
              isFragile,
              recipientName,
              recipientPhone,
              paymentMethod: normalizedPaymentMethod,
              scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
              status: "REQUESTED"
            },
            include: {
              rideType: true,
              customer: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true
                }
              }
            }
          })

          // Create initial tracking update
          await tx.rideTracking.create({
            data: {
              rideBookingId: newBooking.id,
              latitude: pickupLatitude,
              longitude: pickupLongitude,
              status: "REQUESTED",
              notes: "Booking created, looking for nearby riders"
            }
          })

          // Update wallet transactions if payment method is wallet
          if ((paymentData?.paymentMethod === 'WALLET' || paymentData?.paymentMethod === 'wallet' || normalizedPaymentMethod === 'WALLET') && paymentData) {
            // Update wallet balance to ensure it matches payment data.
            await tx.wallet.update({
              where: { id: paymentData.updatedWallet.id },
              data: {
                balance: paymentData.updatedWallet.balance
              }
            })

            // Update walletTransaction status to COMPLETED
            await tx.walletTransaction.update({
              where: { id: paymentData.walletTransaction.id },
              data: { status: 'COMPLETED' }
            })

            // Update transaction status to COMPLETED
            await tx.transaction.update({
              where: { id: paymentData.transaction.id },
              data: { status: 'COMPLETED' }
            })
          }

          // Handle card payments (saved or new card)
          if (normalizedPaymentMethod === 'CARD' && paymentData) {
            // Saved card payment - update existing Payment record
            if (paymentData.paymentId) {
              await tx.payment.update({
                where: { id: paymentData.paymentId },
                data: {
                  status: 'PAID',
                  orderId: newBooking.id
                }
              })
            } 
            // New card payment - create Payment record
            else if (paymentData.id) {
              await tx.payment.create({
                data: {
                  userId: user.id,
                  amount: payableTotal,
                  currency: paymentData.currency || 'USD',
                  status: 'PAID',
                  gateway: paymentData.gateway || 'STRIPE',
                  gatewayTransactionId: paymentData.id,
                  orderId: newBooking.id,
                  description: `Payment for ride booking ${bookingNumber}`,
                  metadata: {
                    bookingId: newBooking.id,
                    bookingNumber,
                    fare: finalFare,
                    platformFee,
                    payableTotal,
                    paymentMethod: paymentData.paymentMethod || 'one_time',
                    clientSecret: paymentData.clientSecret
                  }
                }
              })
            }
          }

          // Record promo code usage if applied
          if (validatedPromoCode && promoCodeDiscount > 0) {
            await tx.promoCodeUsage.create({
              data: {
                promoCodeId: validatedPromoCode.id,
                rideBookingId: newBooking.id,
                userId: user.id,
                discount: promoCodeDiscount,
              },
            })

            // Increment promo code usage count
            await tx.promoCode.update({
              where: { id: validatedPromoCode.id },
              data: {
                usedCount: {
                  increment: 1,
                },
              },
            })
          }

          return newBooking
        } else {
          // Courier booking
          const newBooking = await tx.courierBooking.create({
            data: {
              bookingNumber,
              customerId: user.id,
              rideTypeId,
              pickupAddress,
              pickupLatitude,
              pickupLongitude,
              dropAddress,
              dropLatitude,
              dropLongitude,
              distance: distanceData.distance,
              estimatedTime: Math.ceil(distanceData.duration / 60),
              fare: finalFare,
              notes: specialRequests,
              recipientName,
              recipientPhone,
              packageType,
              packageWeight,
              isFragile,
              paymentMethod: normalizedPaymentMethod,
              module: courierModule as any,
              scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
              status: "REQUESTED"
            },
            include: {
              rideType: true,
              customer: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true
                }
              }
            }
          })

          // Create initial tracking update
          await tx.courierTracking.create({
            data: {
              bookingId: newBooking.id,
              status: "REQUESTED",
              notes: "Booking created, looking for nearby riders"
            }
          })

          // Update wallet transactions if payment method is wallet
          if ((paymentData?.paymentMethod === 'WALLET' || paymentData?.paymentMethod === 'wallet' || normalizedPaymentMethod === 'WALLET') && paymentData) {
            // Update wallet balance to ensure it matches payment data
            await tx.wallet.update({
              where: { id: paymentData.updatedWallet.id },
              data: {
                balance: paymentData.updatedWallet.balance
              }
            })

            // Update walletTransaction status to COMPLETED
            await tx.walletTransaction.update({
              where: { id: paymentData.walletTransaction.id },
              data: { status: 'COMPLETED' }
            })

            // Update transaction status to COMPLETED
            await tx.transaction.update({
              where: { id: paymentData.transaction.id },
              data: { status: 'COMPLETED' }
            })
          }

          // Handle card payments (saved or new card)
          if (normalizedPaymentMethod === 'CARD' && paymentData) {
            // Saved card payment - update existing Payment record
            if (paymentData.paymentId) {
              await tx.payment.update({
                where: { id: paymentData.paymentId },
                data: {
                  status: 'PAID',
                  orderId: newBooking.id
                }
              })
            } 
            // New card payment - create Payment record
            else if (paymentData.id) {
              await tx.payment.create({
                data: {
                  userId: user.id,
                  amount: payableTotal,
                  currency: paymentData.currency || 'USD',
                  status: 'PAID',
                  gateway: paymentData.gateway || 'STRIPE',
                  gatewayTransactionId: paymentData.id,
                  orderId: newBooking.id,
                  description: `Payment for courier booking ${bookingNumber}`,
                  metadata: {
                    bookingId: newBooking.id,
                    bookingNumber,
                    fare: finalFare,
                    platformFee,
                    payableTotal,
                    paymentMethod: paymentData.paymentMethod || 'one_time',
                    clientSecret: paymentData.clientSecret
                  }
                }
              })
            }
          }

          // Record promo code usage if applied
          if (validatedPromoCode && promoCodeDiscount > 0) {
            await tx.promoCodeUsage.create({
              data: {
                promoCodeId: validatedPromoCode.id,
                courierBookingId: newBooking.id,
                userId: user.id,
                discount: promoCodeDiscount,
              },
            })

            // Increment promo code usage count
            await tx.promoCode.update({
              where: { id: validatedPromoCode.id },
              data: {
                usedCount: {
                  increment: 1,
                },
              },
            })
          }

          // Create order for courier booking
          const orderNumber = `CO${Date.now()}${Math.floor(Math.random() * 1000)}`
          const order = await tx.order.create({
            data: {
              orderNumber,
              customerId: user.id,
              module: 'COURIER',
              subtotal: finalFare,
              deliveryFee: 0,
              serviceFee: 0,
              tax: 0,
              discount: promoCodeDiscount || 0,
              total: finalFare,
              paymentStatus: 'PAID',
              paymentMethod: normalizedPaymentMethod,
              notes: specialRequests || null,
              specialInstructions: specialRequests || null,
              status: 'PENDING',
              metadata: {
                courierBookingId: newBooking.id,
                bookingNumber: bookingNumber,
                pickupAddress: pickupAddress,
                dropAddress: dropAddress,
                packageType: packageType,
                packageWeight: packageWeight,
                isFragile: isFragile,
                recipientName: recipientName,
                recipientPhone: recipientPhone,
              },
            },
          })

          // Update courier booking with orderId
          await tx.courierBooking.update({
            where: { id: newBooking.id },
            data: { orderId: order.id },
          })

          return newBooking
        }
      })
    } catch (bookingError) {
      console.error("Booking creation error:", bookingError)
      
      // Handle payment reversion on booking failure
      if (paymentData && (normalizedPaymentMethod === 'WALLET' || normalizedPaymentMethod === 'CARD')) {
        try {
          await prisma.$transaction(async (tx) => {
            // Revert wallet payment if used
            if ((paymentData?.paymentMethod === 'WALLET' || paymentData?.paymentMethod === 'wallet' || normalizedPaymentMethod === 'WALLET') && paymentData.updatedWallet) {
              const wallet = await tx.wallet.findUnique({
                where: { id: paymentData.updatedWallet.id }
              })

              if (wallet) {
                // Revert the balance by adding the amount back
                await tx.wallet.update({
                  where: { id: paymentData.updatedWallet.id },
                  data: {
                    balance: {
                      increment: paymentData.amount
                    }
                  }
                })
              }

              // Note: We keep walletTransaction and transaction status as PENDING
              // They will need to be manually reviewed or handled separately
            }

            // Revert card payment if used
            if (normalizedPaymentMethod === 'CARD' && paymentData) {
              // For saved card payments - mark Payment as FAILED
              if (paymentData.paymentId) {
                await tx.payment.update({
                  where: { id: paymentData.paymentId },
                  data: {
                    status: 'FAILED',
                    gatewayResponse: {
                      error: 'Booking creation failed',
                      bookingError: bookingError instanceof Error ? bookingError.message : 'Unknown error'
                    }
                  }
                }).catch(() => {
                  // Payment record might not exist, continue
                })
              }
              // For new card payments - if Payment record was created, mark it as FAILED
              // Note: New card payments might not have a Payment record yet, so we check
              else if (paymentData.id) {
                // Try to find existing Payment by gatewayTransactionId
                const existingPayment = await tx.payment.findFirst({
                  where: {
                    gatewayTransactionId: paymentData.id,
                    userId: user.id
                  }
                })

                if (existingPayment) {
                  await tx.payment.update({
                    where: { id: existingPayment.id },
                    data: {
                      status: 'FAILED',
                      gatewayResponse: {
                        error: 'Booking creation failed',
                        bookingError: bookingError instanceof Error ? bookingError.message : 'Unknown error'
                      }
                    }
                  })
                }
              }
            }
          })
        } catch (revertError) {
          console.error("Error reverting payment transaction:", revertError)
          // Log but don't fail - this is a cleanup operation
        }
      }

      return NextResponse.json({ 
        error: "Failed to create booking. Payment has been reversed if payment was used." 
      }, { status: 500 })
    }

    // Find nearby available riders and send socket notifications
    const socketServer = getGlobalSocketServer()
    const nearbyRiders = await findNearbyRiders(pickupLatitude, pickupLongitude, 10) // 10km radius
    

    await dispatchBookingInWaves({
      bookingId: booking.id,
      bookingType: rideType.category === 'RIDE' ? 'RIDE' : 'COURIER',
      bookingModule: rideType.category === 'RIDE' ? 'RIDING' : courierModule,
      customerId: user.id,
      customerName: user.name || "Customer",
      customerPhone: user.phone || null,
      nearbyRiders,
      pickupLatitude,
      pickupLongitude,
      pickupAddress,
      dropLatitude,
      dropLongitude,
      dropAddress,
      fare: estimatedFare,
      distanceKm: distanceData.distance,
      estimatedArrivalMinutes: Math.ceil(distanceData.duration / 60),
      rideTypeName: rideType.name,
      vehicleType: rideType.vehicleType,
      passengerCount,
      specialRequests,
      packageType,
      packageWeight,
      isFragile,
      recipientName,
      recipientPhone,
      scheduledAt,
      socketServer,
    })

   
    return NextResponse.json({
      success: true,
      data: {
        booking,

        estimation: {
          distance: distanceData.distance,
          duration: Math.ceil(distanceData.duration / 60),
          fare: estimatedFare
        },
        nearbyRiders: nearbyRiders.length
      }
    }, { status: 201 })
  } catch (error) {
    console.error("Ride booking creation error:", error)
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 })
  }
}

function generateBookingNumber(category: string): string {
  const prefix = category === 'RIDE' ? 'RB' : 'CB'
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000)
  return `${prefix}${timestamp}${random}`
}

async function findNearbyRiders(latitude: number, longitude: number, radiusKm: number) {
  try {
    // Find riders who are online and available
    const riders = await prisma.riderProfile.findMany({
      where: {
        isAvailable: true,
        user: {
          isActive: true,
          isVerified: true
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true
          }
        }
      }
    })

    // Filter riders by distance (simple radius check)
    const nearbyRiders = riders.filter(rider => {
      if (!rider.currentLocation) return false
      
      const location = rider.currentLocation as any
      if (!location.latitude || !location.longitude) return false
      
      const distance = calculateDistance(
        latitude, longitude,
        location.latitude, location.longitude
      )
      
      return distance <= radiusKm
    })
    

    // Sort by distance
    return nearbyRiders.sort((a, b) => {
      const locationA = a.currentLocation as any
      const locationB = b.currentLocation as any
      const distanceA = calculateDistance(latitude, longitude, locationA.latitude, locationA.longitude)
      const distanceB = calculateDistance(latitude, longitude, locationB.latitude, locationB.longitude)
      const scoreA = distanceA - (a.completionRate * 0.05) + (a.cancellationRate * 0.03) - (a.rating * 0.02)
      const scoreB = distanceB - (b.completionRate * 0.05) + (b.cancellationRate * 0.03) - (b.rating * 0.02)
      return scoreA - scoreB
    })
  } catch (error) {
    console.error('Error finding nearby riders:', error)
    return []
  }
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

async function dispatchBookingInWaves(params: {
  bookingId: string
  bookingType: "RIDE" | "COURIER"
  bookingModule?: string | null
  customerId: string
  customerName: string
  customerPhone: string | null
  nearbyRiders: any[]
  pickupLatitude: number
  pickupLongitude: number
  pickupAddress: string
  dropLatitude: number
  dropLongitude: number
  dropAddress: string
  fare: number
  distanceKm: number
  estimatedArrivalMinutes: number
  rideTypeName: string
  vehicleType: string
  passengerCount: number
  specialRequests?: string | null
  packageType?: string | null
  packageWeight?: number | null
  isFragile?: boolean
  recipientName?: string | null
  recipientPhone?: string | null
  scheduledAt?: string | null
  socketServer: ReturnType<typeof getGlobalSocketServer>
}) {
  const isRideTimedRequest =
    params.bookingType === "RIDE" ||
    String(params.bookingModule || "").toUpperCase() === "RIDE" ||
    String(params.bookingModule || "").toUpperCase() === "RIDING"
  const maxAgeMs = isRideTimedRequest ? RIDE_REQUEST_MAX_AGE_MS : NON_RIDE_REQUEST_MAX_AGE_MS
  const expiresAt = new Date(Date.now() + maxAgeMs).toISOString()
  const createdAt = new Date().toISOString()
  const bookingKey = `${params.bookingType}:${params.bookingId}`
  const ridersWithoutActiveBooking = await filterRidersWithoutActiveBooking(params.nearbyRiders)
  const timers: NodeJS.Timeout[] = []
  dispatchTimers.set(bookingKey, timers)

  const runWave = async (waveStart: number, waveSize = DISPATCH_WAVE_SIZE) => {
    const stillPending = await isBookingStillPending(params.bookingId, params.bookingType)
    if (!stillPending) {
      clearDispatchTimers(bookingKey)
      return
    }

    const batch = ridersWithoutActiveBooking.slice(waveStart, waveStart + waveSize)
    if (!batch.length) return

    const lockUntil = new Date(Date.now() + DISPATCH_LOCK_SECONDS * 1000).toISOString()
    for (const rider of batch) {
      const riderUserId = (rider as any).user.id as string
      const riderData = {
        bookingId: params.bookingId,
        riderId: rider.id,
        bookingType: params.bookingType,
        type: params.bookingType === "RIDE" ? "ride" : "courier",
        status: "REQUESTED",
        pickup: { lat: params.pickupLatitude, lng: params.pickupLongitude, address: params.pickupAddress },
        dropoff: { lat: params.dropLatitude, lng: params.dropLongitude, address: params.dropAddress },
        pickupLatitude: params.pickupLatitude,
        pickupLongitude: params.pickupLongitude,
        dropLatitude: params.dropLatitude,
        dropLongitude: params.dropLongitude,
        pickupAddress: params.pickupAddress,
        dropAddress: params.dropAddress,
        estimatedFare: params.fare,
        fare: params.fare,
        distanceKm: params.distanceKm,
        distance: params.distanceKm,
        estimatedArrivalMinutes: params.estimatedArrivalMinutes,
        estimatedTime: params.estimatedArrivalMinutes,
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        rideType: params.rideTypeName,
        vehicleType: params.vehicleType,
        passengerCount: params.passengerCount,
        specialRequests: params.specialRequests,
        packageType: params.packageType,
        packageWeight: params.packageWeight,
        isFragile: params.isFragile,
        recipientName: params.recipientName,
        recipientPhone: params.recipientPhone,
        scheduledAt: params.scheduledAt,
        createdAt,
        expiresAt,
        dispatchLockSeconds: DISPATCH_LOCK_SECONDS,
        lockUntil,
        waveIndex: Math.floor(waveStart / DISPATCH_WAVE_SIZE),
      }

      await params.socketServer.sendNewRideToUser(riderUserId, riderData)
      await NotificationBridge.sendNotification({
        userId: riderUserId,
        title: "New Ride Request",
        message: `New ${params.bookingType === "RIDE" ? "ride" : "delivery"} request from ${params.customerName}. Distance: ${params.distanceKm.toFixed(1)}km, Fare: ${params.fare.toFixed(0)}`,
        type: params.bookingType === "RIDE" ? "RIDE" : "DELIVERY",
        module: "RIDING",
        data: riderData,
        actionUrl: "AvailableRides",
      })
    }
  }

  await runWave(0, DISPATCH_WAVE_SIZE)

  if (isRideTimedRequest) {
    const expansionTimer = setTimeout(() => {
      void runWave(DISPATCH_WAVE_SIZE, DISPATCH_WAVE_SIZE)
    }, RIDE_FIRST_WAVE_MS)
    timers.push(expansionTimer)
  } else {
    for (let waveStart = DISPATCH_WAVE_SIZE; waveStart < ridersWithoutActiveBooking.length; waveStart += DISPATCH_WAVE_SIZE) {
      const timer = setTimeout(() => {
        void runWave(waveStart)
      }, Math.floor(waveStart / DISPATCH_WAVE_SIZE) * DISPATCH_LOCK_SECONDS * 1000)
      timers.push(timer)
    }
  }

  const expiryTimer = setTimeout(async () => {
    try {
      const stillPending = await isBookingStillPending(params.bookingId, params.bookingType)
      if (!stillPending) return

      if (params.bookingType !== "RIDE") {
        await prisma.courierBooking.update({
          where: { id: params.bookingId },
          data: { status: "EXPIRED" },
        })
      }

      for (const rider of ridersWithoutActiveBooking) {
        const riderUserId = (rider as any).user.id as string
        await params.socketServer.sendNotificationToUser(riderUserId, {
          type: "request_removed",
          requestId: params.bookingId,
          reason: params.bookingType === "RIDE" ? "BROADCAST_WINDOW_ENDED" : "EXPIRED",
        })
      }

      await params.socketServer.sendNotificationToUser(params.customerId, {
        type: "request_status_change",
        requestId: params.bookingId,
        newStatus: params.bookingType === "RIDE" ? "BROADCAST_ENDED" : "EXPIRED",
        message:
          params.bookingType === "RIDE"
            ? "No rider accepted in this round. You can broadcast again to more riders."
            : "No rider accepted your request in time. Please try again.",
      })
    } catch (error) {
      console.error("Error expiring request:", error)
    } finally {
      clearDispatchTimers(bookingKey)
    }
  }, maxAgeMs)
  timers.push(expiryTimer)
}

async function filterRidersWithoutActiveBooking(riders: any[]) {
  const riderUserIds = riders.map((r) => (r as any).user.id as string)
  if (!riderUserIds.length) return riders

  const [activeRides, activeCourier] = await Promise.all([
    prisma.rideBooking.findMany({
      where: {
        riderId: { in: riderUserIds },
        status: { in: RIDER_ACTIVE_BOOKING_STATUSES as any },
      },
      select: { riderId: true },
    }),
    prisma.courierBooking.findMany({
      where: {
        riderId: { in: riderUserIds },
        status: { in: RIDER_ACTIVE_BOOKING_STATUSES as any },
      },
      select: { riderId: true },
    }),
  ])

  const blockedRiders = new Set(
    [...activeRides, ...activeCourier]
      .map((b) => b.riderId)
      .filter((id): id is string => Boolean(id))
  )
  return riders.filter((r) => !blockedRiders.has((r as any).user.id))
}

async function isBookingStillPending(bookingId: string, bookingType: "RIDE" | "COURIER") {
  if (bookingType === "RIDE") {
    const booking = await prisma.rideBooking.findUnique({
      where: { id: bookingId },
      select: { status: true },
    })
    return booking
      ? ACTIVE_ASSIGNABLE_STATUSES.includes(booking.status as (typeof ACTIVE_ASSIGNABLE_STATUSES)[number])
      : false
  }

  const booking = await prisma.courierBooking.findUnique({
    where: { id: bookingId },
    select: { status: true },
  })
  return booking
    ? ACTIVE_ASSIGNABLE_STATUSES.includes(booking.status as (typeof ACTIVE_ASSIGNABLE_STATUSES)[number])
    : false
}

function clearDispatchTimers(bookingKey: string) {
  const timers = dispatchTimers.get(bookingKey)
  if (!timers) return
  for (const timer of timers) clearTimeout(timer)
  dispatchTimers.delete(bookingKey)
}
