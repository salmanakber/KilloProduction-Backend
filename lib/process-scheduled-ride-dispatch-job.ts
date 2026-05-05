import { prisma } from "@/lib/prisma"
import { getGlobalSocketServer } from "@/lib/socket-server"
import { dispatchBookingInWaves, findNearbyRidersForRideBooking } from "@/lib/riding-dispatch-waves"
import { NotificationBridge } from "@/lib/notification-bridge"

const PENDING = ["REQUESTED", "BIDDING"] as const

/**
 * BullMQ (food-rider-dispatch queue): at scheduled pickup time, run the same rider dispatch + sockets as immediate bookings.
 */
export async function processScheduledRideDispatchJob(data: { rideBookingId: string }): Promise<void> {
  const { rideBookingId } = data

  const booking = await prisma.rideBooking.findUnique({
    where: { id: rideBookingId },
    include: {
      rideType: true,
      customer: {
        select: { id: true, name: true, phone: true, email: true },
      },
    },
  })

  if (!booking || booking.rideType.category !== "RIDE") return
  if (!booking.scheduledAt) return
  if (!PENDING.includes(booking.status as (typeof PENDING)[number])) return

  await prisma.rideBooking.update({
    where: { id: booking.id },
    data: { requestedAt: new Date() },
  })

  const socketServer = getGlobalSocketServer()
  const nearbyRiders = await findNearbyRidersForRideBooking(
    booking.pickupLatitude,
    booking.pickupLongitude,
    10
  )

  const scheduledIso = booking.scheduledAt.toISOString()
  const vehicleType = String(booking.rideType.vehicleType ?? "")

  await NotificationBridge.sendNotification({
    userId: booking.customerId,
    title: "Scheduled ride started",
    message: "Your scheduled ride is now live. We are finding a rider for you.",
    type: "RIDE",
    module: "RIDING",
    data: {
      requestId: booking.id,
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      newStatus: "SCHEDULED_READY",
      scheduledAt: scheduledIso,
      actionType: "navigate",
      screen: "CustomerRiding",
      params: [{ name: "bookingId", value: booking.id }],
    },
    actionUrl: `/customer/riding/${booking.id}`,
  })
  await socketServer.sendNotificationToUser(booking.customerId, {
    type: "request_status_change",
    requestId: booking.id,
    bookingId: booking.id,
    newStatus: "SCHEDULED_READY",
    message: "Your scheduled ride is now live. We are finding a rider for you.",
    scheduledAt: scheduledIso,
  })

  await dispatchBookingInWaves({
    bookingId: booking.id,
    bookingType: "RIDE",
    bookingModule: "RIDING",
    customerId: booking.customerId,
    customerName: booking.customer?.name || "Customer",
    customerPhone: booking.customer?.phone || null,
    nearbyRiders,
    pickupLatitude: booking.pickupLatitude,
    pickupLongitude: booking.pickupLongitude,
    pickupAddress: booking.pickupAddress,
    dropLatitude: booking.dropLatitude,
    dropLongitude: booking.dropLongitude,
    dropAddress: booking.dropAddress,
    fare: booking.estimatedFare,
    distanceKm: booking.distance,
    estimatedArrivalMinutes: booking.estimatedTime,
    rideTypeName: booking.rideType.name,
    vehicleType,
    passengerCount: booking.passengerCount,
    specialRequests: booking.specialRequests,
    packageType: booking.packageType,
    packageWeight: booking.packageWeight,
    isFragile: booking.isFragile,
    recipientName: booking.recipientName,
    recipientPhone: booking.recipientPhone,
    scheduledAt: scheduledIso,
    socketServer,
  })

  await socketServer.broadcastCourierNewRequestToRiders({
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    type: "ride",
    module: "RIDE",
    pickupLatitude: booking.pickupLatitude,
    pickupLongitude: booking.pickupLongitude,
    dropLatitude: booking.dropLatitude,
    dropLongitude: booking.dropLongitude,
    estimatedFare: booking.estimatedFare,
    distance: booking.distance,
    estimatedTime: booking.estimatedTime,
    pickupAddress: booking.pickupAddress,
    dropAddress: booking.dropAddress,
    customerId: booking.customerId,
    customerName: booking.customer?.name,
    createdAt: new Date().toISOString(),
    scheduledAt: scheduledIso,
  })
}

const COURIER_PENDING = ["REQUESTED", "BIDDING"] as const

/**
 * BullMQ: at `scheduledAt`, dispatch courier (`CourierBooking`) same as immediate `/riding/book` courier flow.
 */
export async function processScheduledCourierDispatchJob(data: {
  courierBookingId: string
}): Promise<void> {
  const { courierBookingId } = data

  const booking = await prisma.courierBooking.findUnique({
    where: { id: courierBookingId },
    include: {
      rideType: true,
      customer: {
        select: { id: true, name: true, phone: true, email: true },
      },
    },
  })

  if (!booking || booking.rideType.category !== "COURIER") return
  if (!booking.scheduledAt) return
  if (!COURIER_PENDING.includes(booking.status as (typeof COURIER_PENDING)[number])) return

  const socketServer = getGlobalSocketServer()
  const nearbyRiders = await findNearbyRidersForRideBooking(
    booking.pickupLatitude,
    booking.pickupLongitude,
    10
  )

  const scheduledIso = booking.scheduledAt.toISOString()
  const vehicleType = String(booking.rideType.vehicleType ?? "")
  const bookingModule = String(booking.module ?? "RIDE").toUpperCase()

  await NotificationBridge.sendNotification({
    userId: booking.customerId,
    title: "Scheduled delivery started",
    message: "Your scheduled request is now live. We are finding a rider for you.",
    type: "DELIVERY",
    module: "RIDING",
    data: {
      requestId: booking.id,
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      newStatus: "SCHEDULED_READY",
      scheduledAt: scheduledIso,
      actionType: "navigate",
      screen: "CustomerRiding",
      params: [{ name: "bookingId", value: booking.id }],
    },
    actionUrl: `/customer/riding/${booking.id}`,
  })
  await socketServer.sendNotificationToUser(booking.customerId, {
    type: "request_status_change",
    requestId: booking.id,
    bookingId: booking.id,
    newStatus: "SCHEDULED_READY",
    message: "Your scheduled request is now live. We are finding a rider for you.",
    scheduledAt: scheduledIso,
  })

  await dispatchBookingInWaves({
    bookingId: booking.id,
    bookingType: "COURIER",
    bookingModule,
    customerId: booking.customerId,
    customerName: booking.customer?.name || "Customer",
    customerPhone: booking.customer?.phone || null,
    nearbyRiders,
    pickupLatitude: booking.pickupLatitude,
    pickupLongitude: booking.pickupLongitude,
    pickupAddress: booking.pickupAddress,
    dropLatitude: booking.dropLatitude,
    dropLongitude: booking.dropLongitude,
    dropAddress: booking.dropAddress,
    fare: booking.fare,
    distanceKm: booking.distance,
    estimatedArrivalMinutes: booking.estimatedTime,
    rideTypeName: booking.rideType.name,
    vehicleType,
    passengerCount: 1,
    specialRequests: booking.notes,
    packageType: booking.packageType,
    packageWeight: booking.packageWeight,
    isFragile: booking.isFragile,
    recipientName: booking.recipientName,
    recipientPhone: booking.recipientPhone,
    scheduledAt: scheduledIso,
    socketServer,
  })

  await socketServer.broadcastCourierNewRequestToRiders({
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    type: "courier",
    module: booking.module || "COURIER",
    pickupLatitude: booking.pickupLatitude,
    pickupLongitude: booking.pickupLongitude,
    dropLatitude: booking.dropLatitude,
    dropLongitude: booking.dropLongitude,
    estimatedFare: booking.fare,
    distance: booking.distance,
    estimatedTime: booking.estimatedTime,
    pickupAddress: booking.pickupAddress,
    dropAddress: booking.dropAddress,
    customerId: booking.customerId,
    customerName: booking.customer?.name,
    createdAt: new Date().toISOString(),
    scheduledAt: scheduledIso,
  })
}
