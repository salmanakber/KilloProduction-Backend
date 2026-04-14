import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from "@/lib/notification-bridge"

/**
 * POST /api/reviews/bulk
 * 
 * Submit multiple reviews at once (e.g., rider + vendor)
 * Body: { bookingId, role, reviews: [{ target: 'rider'|'vendor'|'mechanic'|'wholesaler', id: string, rating, comment, tags? }] }
 */
function parseReviewTarget(raw: string): "RIDER" | "VENDOR" | "MECHANIC" | "WHOLESALER" | "CUSTOMER" | null {
  const u = String(raw || "").toUpperCase()
  if (u === "RIDER") return "RIDER"
  if (u === "VENDOR") return "VENDOR"
  if (u === "MECHANIC") return "MECHANIC"
  if (u === "WHOLESALER" || u === "SUPPLIER") return "WHOLESALER"
  if (u === "CUSTOMER") return "CUSTOMER"
  return null
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || (user.role !== "CUSTOMER" && user.role !== "RIDER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { bookingId, reviews } = body

    if (!bookingId || !reviews || !Array.isArray(reviews) || reviews.length === 0) {
      return NextResponse.json(
        { error: "bookingId and reviews array are required" },
        { status: 400 }
      )
    }

    const isCustomerReviewer = user.role === "CUSTOMER"

    const [rideBooking, courierBooking] = await Promise.all([
      prisma.rideBooking.findFirst({
        where: isCustomerReviewer
          ? { id: bookingId, customerId: user.id }
          : { id: bookingId, riderId: user.id },
      }),
      prisma.courierBooking.findFirst({
        where: isCustomerReviewer
          ? { id: bookingId, customerId: user.id }
          : { id: bookingId, riderId: user.id },
      }),
    ])

    const booking = rideBooking || courierBooking
    if (!booking) {
      return NextResponse.json({ error: "Booking not found or unauthorized" }, { status: 404 })
    }

    const isCourierBooking = !!courierBooking
    
    // Check if reviews already exist - prevent re-submission
    const existingReviews = await prisma.review.findMany({
      where: {
        userId: user.id,
        bookingID: bookingId,
      },
    })

    if (existingReviews.length > 0) {
        console.log('existingReviews', existingReviews)
      return NextResponse.json(
        
        { error: "Reviews have already been submitted for this booking. Reviews cannot be edited or re-submitted." },
        { status: 400 }
      )
    }

    const createdReviews: any[] = []
    const notificationTargets: Array<{ userId: string; targetType: string; targetName: string }> = []

    // Process each review
    for (const reviewData of reviews) {
      const { target, id, rating, comment } = reviewData

      if (!target || !id || !rating || rating < 1 || rating > 5) {
        continue
      }

      const targetType = parseReviewTarget(target)
      if (!targetType) continue

      let riderProfileId: string | null = null
      let targetUserId: string | null = null
      let targetName = ""
      const reviewDataToCreate: Record<string, unknown> = {
        userId: user.id,
        targetId: id,
        targetType,
        rating,
        comment: comment || null,
        bookingID: bookingId,
      }

      let skip = false

      if (targetType === "RIDER") {
        const riderUser = await prisma.user.findUnique({
          where: { id },
          select: { id: true, name: true },
        })
        const riderProfile = await prisma.riderProfile.findUnique({
          where: { userId: id },
        })
        if (riderProfile && riderUser) {
          riderProfileId = riderProfile.id
          targetUserId = riderUser.id
          targetName = riderUser.name || "Rider"
          reviewDataToCreate.riderId = riderProfileId
        } else {
          skip = true
        }
      } else if (targetType === "VENDOR") {
        if (!courierBooking?.orderId) {
          skip = true
        } else {
          const order = await prisma.order.findUnique({
            where: { id: courierBooking.orderId },
            include: {
              vendor: { select: { id: true, name: true } },
              food: { select: { id: true, name: true } },
              pharmacy: { select: { id: true, pharmacyName: true } },
              grocery: { select: { id: true, storeName: true } },
              autoPart: {
                select: {
                  id: true,
                  store: {
                    select: { id: true, storeName: true },
                  },
                },
              }
            },
          })

          if (!order?.vendorId || order.vendorId !== id) {
            skip = true
          } else {
            targetUserId = order.vendorId
            targetName = order.vendor?.name || "Vendor"

            if (order.module === "FOOD" && order.food) {
              reviewDataToCreate.foodId = order.food.id
              targetName = order.food.name || targetName
            } else if (order.module === "PHARMACY" && order.pharmacy) {
              reviewDataToCreate.pharmacyId = order.pharmacy.id
              targetName = order.pharmacy.pharmacyName || targetName
            } else if (order.module === "GROCERY" && order.grocery) {
              reviewDataToCreate.groceryId = order.grocery.id
              targetName = order.grocery.storeName || targetName
            } else if (order.module === "AUTO_PARTS" && order.autoPart?.store) {
              reviewDataToCreate.autoPartId = order.autoPart.id
              targetName = order.autoPart.store.storeName || targetName
            }
            reviewDataToCreate.orderId = courierBooking.orderId
          }
        }
      } else if (targetType === "MECHANIC") {
        const [mechanicProfile, mechanicUser] = await Promise.all([
          prisma.mechanicProfile.findUnique({ where: { userId: id } }),
          prisma.user.findUnique({ where: { id }, select: { id: true, name: true } }),
        ])
        if (!mechanicProfile || !mechanicUser) {
          skip = true
        } else {
          reviewDataToCreate.mechanicId = mechanicProfile.id
          targetUserId = mechanicUser.id
          targetName = mechanicUser.name || "Mechanic"
          if (courierBooking?.orderId) {
            reviewDataToCreate.orderId = courierBooking.orderId
            const order = await prisma.order.findUnique({
              where: { id: courierBooking.orderId },
              select: { module: true, autoPartId: true },
            })
            if (order?.module === "AUTO_PARTS" && order.autoPartId) {
              reviewDataToCreate.autoPartId = order.autoPartId
            }
          }
        }
      } else if (targetType === "CUSTOMER") {
        if (isCustomerReviewer) {
          skip = true
        } else {
          const customerUser = await prisma.user.findUnique({
            where: { id },
            select: { id: true, name: true },
          })
          if (!customerUser) {
            skip = true
          } else if (isCourierBooking && courierBooking!.customerId !== id) {
            skip = true
          } else if (!isCourierBooking && rideBooking && rideBooking.customerId !== id) {
            skip = true
          } else {
            targetUserId = customerUser.id
            targetName = customerUser.name || "Customer"
            if (courierBooking?.orderId) {
              reviewDataToCreate.orderId = courierBooking.orderId
            }
          }
        }
      } else if (targetType === "WHOLESALER") {
        const wholesaler = await prisma.wholesaler.findFirst({
          where: { userId: id },
        })
        if (!wholesaler) {
          skip = true
        } else {
          targetUserId = wholesaler.userId
          targetName = wholesaler.companyName
        }
      }

      if (skip) continue

      const review = await prisma.review.create({
        data: reviewDataToCreate as any,
      })

      createdReviews.push(review)

      if (targetUserId) {
        notificationTargets.push({
          userId: targetUserId,
          targetType,
          targetName,
        })
      }

      if (targetType === "RIDER") {
        if (isCourierBooking) {
          await prisma.courierBooking.update({
            where: { id: bookingId },
            data: {
              customerRating: rating,
              customerReview: comment || null,
            } as any,
          })
        } else {
          await prisma.rideBooking.update({
            where: { id: bookingId },
            data: {
              customerRating: rating,
              customerReview: comment || null,
            },
          })
        }
        if (riderProfileId) {
          await updateRiderRating(riderProfileId)
        }
      } else if (targetType === "CUSTOMER" && !isCustomerReviewer) {
        if (isCourierBooking) {
          await prisma.courierBooking.update({
            where: { id: bookingId },
            data: {
              riderRating: rating,
              riderReview: comment || null,
            } as any,
          })
        } else if (rideBooking) {
          await prisma.rideBooking.update({
            where: { id: bookingId },
            data: {
              riderRating: rating,
              riderReview: comment || null,
            },
          })
        }
      } else if (targetType === "MECHANIC") {
        const mp = await prisma.mechanicProfile.findUnique({ where: { userId: id } })
        if (mp) await updateMechanicRating(mp.id)
      } else if (targetType === "WHOLESALER") {
        const w = await prisma.wholesaler.findFirst({ where: { userId: id } })
        if (w) await updateWholesalerRating(w.id)
      }
    }

    // Get order module for vendor notifications
    let orderModule = "COURIER"
    if (courierBooking?.orderId) {
      orderModule = await getOrderModule(courierBooking.orderId)
    }

    // Send notifications to reviewed targets
    for (const notif of notificationTargets) {
      try {
        let module: string
        if (notif.targetType === "RIDER") {
          module = isCourierBooking ? "COURIER" : "RIDING"
        } else if (notif.targetType === "WHOLESALER") {
          module = "PHARMACY"
        } else if (notif.targetType === "MECHANIC") {
          module = courierBooking?.orderId ? await getOrderModule(courierBooking.orderId) : "AUTO_PARTS"
        } else if (notif.targetType === "CUSTOMER") {
          module = isCourierBooking ? "COURIER" : "RIDING"
        } else {
          module = orderModule
        }

        const roleLabel =
          notif.targetType === "RIDER"
            ? "rider"
            : notif.targetType === "VENDOR"
              ? "vendor"
              : notif.targetType === "MECHANIC"
                ? "mechanic"
                : notif.targetType === "CUSTOMER"
                  ? "customer"
                  : "supplier"

        await NotificationBridge.sendNotification({
          userId: notif.userId,
          title: "New Review Received",
          message: `${user.name} has left you a ${roleLabel} review`,
          type: "REVIEW_REQUEST",
          module: module as any,
          actionUrl: `/reviews?targetId=${notif.userId}&targetType=${notif.targetType}`,
          data: {
            actionType: "navigate",
            screen: "Reviews",
            params: [
              { name: "targetId", value: notif.userId },
              { name: "targetType", value: notif.targetType },
            ],
          },
        })
      } catch (error) {
        console.error(`Error sending notification to ${notif.userId}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      message: "Reviews submitted successfully",
      reviews: createdReviews,
    })
  } catch (error: any) {
    console.error("Error submitting bulk reviews:", error)
    return NextResponse.json(
      { error: error.message || "Failed to submit reviews" },
      { status: 500 }
    )
  }
}

async function updateRiderRating(riderProfileId: string) {
  try {
    const reviews = await prisma.review.findMany({
      where: {
        riderId: riderProfileId,
        targetType: "RIDER",
      },
      select: { rating: true },
    })

    if (reviews.length === 0) return

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0)
    const averageRating = totalRating / reviews.length

    await prisma.riderProfile.update({
      where: { id: riderProfileId },
      data: {
        rating: averageRating,
        averageRating: averageRating,
      },
    })
  } catch (error) {
    console.error("Error updating rider rating:", error)
  }
}

async function updateMechanicRating(mechanicProfileId: string) {
  try {
    const reviews = await prisma.review.findMany({
      where: {
        mechanicId: mechanicProfileId,
        targetType: "MECHANIC",
      },
      select: { rating: true },
    })
    if (reviews.length === 0) return
    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0)
    const averageRating = totalRating / reviews.length
    await prisma.mechanicProfile.update({
      where: { id: mechanicProfileId },
      data: {
        rating: averageRating,
        totalReviews: reviews.length,
      },
    })
  } catch (error) {
    console.error("Error updating mechanic rating:", error)
  }
}

async function updateWholesalerRating(wholesalerId: string) {
  try {
    const wholesaler = await prisma.wholesaler.findUnique({
      where: { id: wholesalerId },
      select: { userId: true },
    })
    if (!wholesaler) return
    const reviews = await prisma.review.findMany({
      where: {
        targetId: wholesaler.userId,
        targetType: "WHOLESALER",
      },
      select: { rating: true },
    })
    if (reviews.length === 0) return
    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0)
    const averageRating = totalRating / reviews.length
    await prisma.wholesaler.update({
      where: { id: wholesalerId },
      data: {
        rating: averageRating,
      },
    })
  } catch (error) {
    console.error("Error updating wholesaler rating:", error)
  }
}

async function getOrderModule(orderId: string): Promise<string> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { module: true },
    })
    return order?.module || "COURIER"
  } catch {
    return "COURIER"
  }
}
