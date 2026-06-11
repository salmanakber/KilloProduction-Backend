import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { calculateFare as calculateFareService } from "@/lib/fare-calculation-service"
import { checkoutPlatformFeeAmount } from "@/lib/commission-service"
import { dispatchBookingInWaves, findNearbyRidersForRideBooking } from "@/lib/riding-dispatch-waves"
import {
  scheduleScheduledCourierDispatchJob,
  scheduleScheduledRideDispatchJob,
} from "@/lib/food-rider-dispatch-queue"

const DEFAULT_BID_CAP_PERCENT = 20

function getBidCapPercent(): number {
  const raw = Number(process.env.RIDING_BID_CAP_PERCENT ?? DEFAULT_BID_CAP_PERCENT)
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_BID_CAP_PERCENT
  return raw
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

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

          console.log("Missing required fields: rideTypeId, pickupAddress, dropAddress, coordinates")
      return NextResponse.json({ 
        
        error: "Missing required fields: rideTypeId, pickupAddress, dropAddress, coordinates" 
      }, { status: 400 })
    }


    // Get ride type details
    const rideType = await prisma.rideType.findUnique({
      where: { id: rideTypeId }
    })
 

    if (!rideType) {
      
      console.log("Invalid ride type")
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
    if (!["CARD", "WALLET", "PAY_ON_ARRIVAL"].includes(normalizedPaymentMethod)) {
      console.log("Only card, wallet, or pay-on-arrival payments are supported for this booking flow")
      return NextResponse.json({
        error: "Only card, wallet, or pay-on-arrival payments are supported for this booking flow",
      }, { status: 400 })
    }

    // Card payment still requires payment payload (wallet-cap flow may not).
    if (normalizedPaymentMethod === "CARD" && !paymentData) {
      console.log("Payment data is required")
      return NextResponse.json({
        error: "Payment data is required"
      }, { status: 400 })
    }

    // Handle payment validation for wallet and card payments when payload is provided.
    if ((normalizedPaymentMethod === 'WALLET' || normalizedPaymentMethod === 'CARD') && paymentData) {
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

    // Wallet-cap flow: no immediate payment payload, but wallet must cover max possible bid.
    if (normalizedPaymentMethod === "WALLET" && !paymentData) {
      const bidCapPercent = getBidCapPercent()
      const maxBidCapFare = round2(finalFare * (1 + bidCapPercent / 100))
      const maxBidPlatformFee = await checkoutPlatformFeeAmount("RIDING", maxBidCapFare)
      const requiredWalletCoverageAmount = round2(maxBidCapFare + maxBidPlatformFee)

      const wallet = await prisma.wallet.findUnique({
        where: { userId: user.id },
        select: { id: true, balance: true, isActive: true },
      })
      if (!wallet || !wallet.isActive) {
        return NextResponse.json({
          error: "Active wallet is required for ride bookings",
        }, { status: 400 })
      }
      if (Number(wallet.balance || 0) < requiredWalletCoverageAmount) {
        return NextResponse.json({
          error: "Insufficient wallet balance for max bid cap coverage",
          requiredWalletCoverageAmount,
          currentWalletBalance: Number(wallet.balance || 0),
          bidCapPercent,
          maxBidCapFare,
        }, { status: 400 })
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

          // Customer already charged at booking time (card or wallet withdraw): mark ride paid so completion does not debit again.
          const settledAtBooking =
            Boolean(paymentData) &&
            (normalizedPaymentMethod === "CARD" || normalizedPaymentMethod === "WALLET")
          if (settledAtBooking) {
            await tx.rideBooking.update({
              where: { id: newBooking.id },
              data: { paymentStatus: "PAID" },
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

          const courierSettledAtBooking =
            Boolean(paymentData) &&
            (normalizedPaymentMethod === "CARD" || normalizedPaymentMethod === "WALLET")
          if (courierSettledAtBooking) {
            await tx.courierBooking.update({
              where: { id: newBooking.id },
              data: { paymentStatus: "PAID" },
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

    const scheduledInstant = scheduledAt ? new Date(scheduledAt as string) : null
    const isFutureScheduled =
      Boolean(scheduledInstant) &&
      Number.isFinite(scheduledInstant!.getTime()) &&
      scheduledInstant!.getTime() > Date.now()

    const isFutureScheduledRide = rideType.category === "RIDE" && isFutureScheduled
    const isFutureScheduledCourier = rideType.category === "COURIER" && isFutureScheduled

    let nearbyRidersCount = 0

    if (isFutureScheduledRide && booking.id) {
      const delayMs = scheduledInstant!.getTime() - Date.now()
      const queued = await scheduleScheduledRideDispatchJob({
        rideBookingId: booking.id,
        delayMs,
      })
      if (!queued) {
        console.warn(
          "[riding/book] scheduled ride job not queued (REDIS_URL?). Dispatching immediately as fallback."
        )
        const socketServer = getGlobalSocketServer()
        const nearbyRiders = await findNearbyRidersForRideBooking(pickupLatitude, pickupLongitude, 10)
        nearbyRidersCount = nearbyRiders.length
        await dispatchBookingInWaves({
          bookingId: booking.id,
          bookingType: "RIDE",
          bookingModule: "RIDING",
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
          scheduledAt: scheduledInstant!.toISOString(),
          socketServer,
        })
      }
    } else if (isFutureScheduledCourier && booking.id) {
      const delayMs = scheduledInstant!.getTime() - Date.now()
      const queued = await scheduleScheduledCourierDispatchJob({
        courierBookingId: booking.id,
        delayMs,
      })
      if (!queued) {
        console.warn(
          "[riding/book] scheduled courier job not queued (REDIS_URL?). Dispatching immediately as fallback."
        )
        const socketServer = getGlobalSocketServer()
        const nearbyRiders = await findNearbyRidersForRideBooking(pickupLatitude, pickupLongitude, 10)
        nearbyRidersCount = nearbyRiders.length
        await dispatchBookingInWaves({
          bookingId: booking.id,
          bookingType: "COURIER",
          bookingModule: courierModule,
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
          scheduledAt: scheduledInstant!.toISOString(),
          socketServer,
        })
      }
    } else {
      const socketServer = getGlobalSocketServer()
      const nearbyRiders = await findNearbyRidersForRideBooking(pickupLatitude, pickupLongitude, 10)
      nearbyRidersCount = nearbyRiders.length

      await dispatchBookingInWaves({
        bookingId: booking.id,
        bookingType: rideType.category === "RIDE" ? "RIDE" : "COURIER",
        bookingModule: rideType.category === "RIDE" ? "RIDING" : courierModule,
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
        nearbyRiders: nearbyRidersCount
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
