import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { NotificationBridge } from "@/lib/notification-bridge"
import { calculateFare as calculateFareService } from "@/lib/fare-calculation-service"

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
      promoCodeDiscount

    } = data

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

    // Calculate distance and fare using shared fare calculation service
    const fareResult = await calculateFareService({
      originLatitude: pickupLatitude,
      originLongitude: pickupLongitude,
      destinationLatitude: dropLatitude,
      destinationLongitude: dropLongitude,
      rideTypeId,
    })

    const distanceData = {
      distance: fareResult.distance,
      duration: fareResult.duration,
    }

    let estimatedFare = fareResult.fare
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

    // Handle payment validation for wallet and card payments
    if (paymentMethod === 'WALLET' || paymentMethod === 'wallet' || paymentMethod === 'CARD' || paymentMethod === 'card') {
      if (!paymentData) {
        return NextResponse.json({ 
          error: "Payment data is required" 
        }, { status: 400 })
      }

      // Validate payment amount matches final fare (after promo discount)
      if (paymentData.amount !== finalFare) {
        return NextResponse.json({ 
          error: "Payment amount does not match final fare" 
        }, { status: 400 })
      }

      // Validate payment status
      if (paymentData.status !== 'succeeded' && paymentData.status !== 'PAID') {
        return NextResponse.json({ 
          error: "Payment not successful" 
        }, { status: 400 })
      }

      // Wallet-specific validation
      if ((paymentMethod === 'WALLET' || paymentMethod === 'wallet') && (!paymentData.walletTransaction || !paymentData.transaction)) {
        return NextResponse.json({ 
          error: "Wallet transaction data is required for wallet payments" 
        }, { status: 400 })
      }

      // Card payment validation (saved or new)
      if (paymentMethod === 'CARD' || paymentMethod === 'card') {
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
              paymentMethod,
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
          if ((paymentData?.paymentMethod === 'WALLET' || paymentData?.paymentMethod === 'wallet' || paymentMethod === 'WALLET' || paymentMethod === 'wallet') && paymentData) {
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
          if ((paymentMethod === 'CARD' || paymentMethod === 'card') && paymentData) {
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
                  amount: finalFare,
                  currency: paymentData.currency || 'USD',
                  status: 'PAID',
                  gateway: paymentData.gateway || 'STRIPE',
                  gatewayTransactionId: paymentData.id,
                  orderId: newBooking.id,
                  description: `Payment for ride booking ${bookingNumber}`,
                  metadata: {
                    bookingId: newBooking.id,
                    bookingNumber,
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
              paymentMethod,
              module: "RIDE",
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
          if ((paymentData?.paymentMethod === 'WALLET' || paymentData?.paymentMethod === 'wallet' || paymentMethod === 'WALLET' || paymentMethod === 'wallet') && paymentData) {
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
          if ((paymentMethod === 'CARD' || paymentMethod === 'card') && paymentData) {
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
                  amount: finalFare,
                  currency: paymentData.currency || 'USD',
                  status: 'PAID',
                  gateway: paymentData.gateway || 'STRIPE',
                  gatewayTransactionId: paymentData.id,
                  orderId: newBooking.id,
                  description: `Payment for courier booking ${bookingNumber}`,
                  metadata: {
                    bookingId: newBooking.id,
                    bookingNumber,
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
              paymentStatus: paymentMethod === 'CASH' || paymentMethod === 'cash' ? 'PENDING' : 'PAID',
              paymentMethod: paymentMethod,
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
      if (paymentData && (paymentMethod === 'WALLET' || paymentMethod === 'wallet' || paymentMethod === 'CARD' || paymentMethod === 'card')) {
        try {
          await prisma.$transaction(async (tx) => {
            // Revert wallet payment if used
            if ((paymentData?.paymentMethod === 'WALLET' || paymentData?.paymentMethod === 'wallet' || paymentMethod === 'WALLET' || paymentMethod === 'wallet') && paymentData.updatedWallet) {
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
            if ((paymentMethod === 'CARD' || paymentMethod === 'card') && paymentData) {
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
    

    // Send notifications to nearby riders
    for (const rider of nearbyRiders) {
      const riderData = {
        bookingId: booking.id,
        riderId: rider.id,
        bookingType: rideType.category === 'RIDE' ? 'RIDE' : 'COURIER',
        pickup: { 
          lat: pickupLatitude, 
          lng: pickupLongitude,
          address: pickupAddress
        },
        dropoff: { 
          lat: dropLatitude, 
          lng: dropLongitude,
          address: dropAddress
        },
        fare: estimatedFare,
        distanceKm: distanceData.distance,
        estimatedArrivalMinutes: Math.ceil(distanceData.duration / 60),
        customerName: user.name || 'Customer',
        customerPhone: user.phone,
        rideType: rideType.name,
        vehicleType: rideType.vehicleType,
        passengerCount: passengerCount,
        specialRequests: specialRequests,
        packageType: packageType,
        packageWeight: packageWeight,
        isFragile: isFragile,
        recipientName: recipientName,
        recipientPhone: recipientPhone,
        scheduledAt: scheduledAt,
        createdAt: new Date().toISOString()
      }

      // Send socket notification
      await socketServer.sendNewRideToUser((rider as any).user.id, riderData)
            // Send notification to rider
    await NotificationBridge.sendNotification({
      userId: (rider as any).user.id,
      title: "New Ride Request",
      message: `New ${rideType.category === 'RIDE' ? 'ride' : 'delivery'} request from ${user.name || 'Customer'}. Distance: ${distanceData.distance.toFixed(1)}km, Fare: ${estimatedFare.toFixed(0)}`,
      type: rideType.category === 'RIDE' ? 'RIDE' : 'DELIVERY',
      module: "RIDING",
      data: riderData,
      actionUrl: `AvailableRides`
    })

      // Send push notification
      await socketServer.sendNotificationToUser((rider as any).user.id, {
        userId: (rider as any).user.id,
        title: "New Ride Request",
        message: `New ${rideType.category === 'RIDE' ? 'ride' : 'delivery'} request from ${user.name || 'Customer'}. Distance: ${distanceData.distance.toFixed(1)}km, Fare: ₦${estimatedFare.toFixed(0)}`,
        type: "RIDE_REQUEST",
        module: "RIDING",
        data: riderData,
        actionUrl: `/rider/requests/${booking.id}`
      })


      
    }

   
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
      return distanceA - distanceB
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
