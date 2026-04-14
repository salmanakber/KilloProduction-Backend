import { prisma } from "@/lib/prisma"
import type { $Enums } from "@prisma/client"

const REVIEW_TARGET_CUSTOMER = "CUSTOMER" as $Enums.ReviewTarget

/** Aggregate rating for a user as a CUSTOMER (reviews left by riders/vendors about them). */
export async function getCustomerRating(customerId: string) {
  const result = await prisma.review.aggregate({
    where: {
      targetId: customerId,
      targetType: REVIEW_TARGET_CUSTOMER,
    },
    _avg: {
      rating: true,
    },
    _count: {
      _all: true,
    },
  })

  return {
    average: result._avg?.rating != null ? Number(Number(result._avg.rating).toFixed(2)) : 0,
    totalReviews: result._count?._all ?? 0,
  }
}

const COMPLETED_RIDE_STATUSES = ["COMPLETED", "DELIVERED"] as const

export type CustomerRideHistoryItem = {
  id: string
  bookingNumber: string
  pickupAddress: string
  dropAddress: string
  distance: number
  fare: number
  status: string
  completedAt: string | null
  createdAt: string
}

/** Past ride bookings for this customer (as a rider-hailing passenger). */
export async function getCustomerRideHistory(
  customerId: string,
  take = 25
): Promise<{ rides: CustomerRideHistoryItem[]; totalCount: number }> {
  const [rows, totalCount] = await Promise.all([
    prisma.rideBooking.findMany({
      where: {
        customerId,
        status: { in: [...COMPLETED_RIDE_STATUSES] },
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take,
      select: {
        id: true,
        bookingNumber: true,
        pickupAddress: true,
        dropAddress: true,
        distance: true,
        estimatedFare: true,
        finalFare: true,
        status: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    prisma.rideBooking.count({
      where: {
        customerId,
        status: { in: [...COMPLETED_RIDE_STATUSES] },
      },
    }),
  ])

  const rides: CustomerRideHistoryItem[] = rows.map((r) => ({
    id: r.id,
    bookingNumber: r.bookingNumber,
    pickupAddress: r.pickupAddress,
    dropAddress: r.dropAddress,
    distance: r.distance,
    fare: r.finalFare ?? r.estimatedFare,
    status: r.status,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }))

  return { rides, totalCount }
}
