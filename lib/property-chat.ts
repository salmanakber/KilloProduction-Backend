import { prisma } from "@/lib/prisma"
import { Module } from "@prisma/client"

export async function ensurePropertyBookingConversation(bookingId: string, userId: string) {
  const booking = await prisma.propertyBooking.findUnique({
    where: { id: bookingId },
    select: { id: true, customerId: true, vendorId: true, bookingNumber: true },
  })
  if (!booking) throw new Error("Booking not found")
  if (booking.customerId !== userId && booking.vendorId !== userId) {
    throw new Error("Forbidden")
  }

  const existing = await prisma.conversation.findFirst({
    where: {
      module: Module.PROPERTY,
      orderId: bookingId,
      customerId: booking.customerId,
      vendorId: booking.vendorId,
    },
  })
  if (existing) return existing

  return prisma.conversation.create({
    data: {
      module: Module.PROPERTY,
      orderId: bookingId,
      customerId: booking.customerId,
      vendorId: booking.vendorId,
    },
  })
}

/** Pre-booking inquiry: customer messages host about a listing */
export async function ensurePropertyListingConversation(listingId: string, userId: string) {
  const listing = await prisma.propertyListing.findUnique({
    where: { id: listingId },
    select: { id: true, vendorId: true, title: true, status: true },
  })
  if (!listing || listing.status !== "ACTIVE") {
    throw new Error("Listing not available")
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  })
  if (!user || user.role !== "CUSTOMER") {
    throw new Error("Only guests can message hosts about a listing")
  }
  if (listing.vendorId === userId) {
    throw new Error("You cannot message your own listing")
  }

  const existing = await prisma.conversation.findFirst({
    where: {
      module: Module.PROPERTY,
      orderId: listingId,
      customerId: userId,
      vendorId: listing.vendorId,
    },
  })
  if (existing) return existing

  return prisma.conversation.create({
    data: {
      module: Module.PROPERTY,
      orderId: listingId,
      customerId: userId,
      vendorId: listing.vendorId,
    },
  })
}
