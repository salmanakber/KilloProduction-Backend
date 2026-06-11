import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from '@/lib/auth'
import { rejectIfRiderCommissionLocked } from '@/lib/rider-app-access'
import {
  buildRiderFeedbackPlan,
  type FeedbackCardDef,
  type FeedbackPlanInput,
} from "@/lib/customer-feedback-plan"

/**
 * GET /api/rider/feedback-context?bookingId=...
 * Rating cards for the assigned rider after completing a trip.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "RIDER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const riderLockResponse = rejectIfRiderCommissionLocked(user)
    if (riderLockResponse) return riderLockResponse

    const bookingId = request.nextUrl.searchParams.get("bookingId")
    const orderIdParam = request.nextUrl.searchParams.get("orderId")

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 })
    }

    const [courierBooking, rideBooking] = await Promise.all([
      prisma.courierBooking.findFirst({
        where: { id: bookingId, riderId: user.id },
        include: {
          rider: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
          supplierOrders: {
            include: {
              wholesaler: { select: { id: true, companyName: true, userId: true } },
            },
          },
        },
      }),
      prisma.rideBooking.findFirst({
        where: { id: bookingId, riderId: user.id },
        include: { customer: { select: { id: true, name: true } } },
      }),
    ])

    if (!courierBooking && !rideBooking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }

    if (rideBooking && !courierBooking) {
      const input: FeedbackPlanInput & { customer: { id: string; name: string | null } } = {
        bookingId,
        bookingKind: "RIDE",
        courierModule: null,
        order: null,
        rider: { id: user.id, name: user.name },
        supplierOrders: [],
        customer: rideBooking.customer,
      }
      const cards = buildRiderFeedbackPlan(input)
      return NextResponse.json({
        success: true,
        bookingId,
        bookingKind: "RIDE" as const,
        cards,
      })
    }

    const cb = courierBooking!
    const resolvedOrderId = orderIdParam || cb.orderId || undefined

    let orderPayload: FeedbackPlanInput["order"] = null
    if (resolvedOrderId) {
      const order = await prisma.order.findFirst({
        where: { id: resolvedOrderId, customerId: cb.customerId },
        include: {
          pharmacy: { select: { id: true, pharmacyName: true } },
          food: { select: { id: true, name: true } },
          grocery: { select: { id: true, storeName: true } },
          autoPart: {
            select: {
              id: true,
              store: { select: { id: true, storeName: true } },
            },
          },
          partRequest: {
            include: {
              offers: {
                include: { mechanic: { select: { id: true, name: true } } },
                orderBy: { createdAt: "desc" },
              },
            },
          },
        },
      })

      if (order) {
        orderPayload = {
          id: order.id,
          module: order.module,
          riderId: order.riderId,
          vendorId: order.vendorId,
          pharmacy: order.pharmacy,
          food: order.food,
          grocery: order.grocery,
          autoPart: order.autoPart,
          partRequest: order.partRequest
            ? {
                needsMechanic: order.partRequest.needsMechanic,
                offers: order.partRequest.offers.map((o) => ({
                  mechanicId: o.mechanicId,
                  mechanic: o.mechanic ? { id: o.mechanic.id, name: o.mechanic.name } : null,
                  status: o.status,
                })),
              }
            : null,
        }
      }
    }

    const supplierOrders = cb.supplierOrders.map((so) => ({
      wholesaler: {
        id: so.wholesaler.id,
        companyName: so.wholesaler.companyName,
        userId: so.wholesaler.userId,
      },
    }))

    const input: FeedbackPlanInput & { customer: { id: string; name: string | null } } = {
      bookingId,
      bookingKind: "COURIER",
      courierModule: cb.module,
      order: orderPayload,
      rider: cb.rider ? { id: cb.rider.id, name: cb.rider.name } : { id: user.id, name: user.name },
      supplierOrders,
      customer: cb.customer,
    }

    const cards: FeedbackCardDef[] = buildRiderFeedbackPlan(input)

    return NextResponse.json({
      success: true,
      bookingId,
      bookingKind: "COURIER" as const,
      courierModule: cb.module,
      orderId: resolvedOrderId ?? null,
      cards,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load feedback context"
    console.error("rider feedback-context:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
