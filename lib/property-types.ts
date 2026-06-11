import type {
  PropertyBooking,
  PropertyListing,
  PropertyListingType,
  User,
} from "@prisma/client"
import { normalizePropertyGuestTier } from "@/lib/property-guest-tier"

export type PropertyListingWithVendor = PropertyListing & {
  vendor?: Pick<User, "id" | "name" | "avatar" | "phone"> | null
}

export type PropertyBookingWithRelations = PropertyBooking & {
  listing?: PropertyListingWithVendor | null
  customer?: Pick<User, "id" | "name" | "avatar" | "phone"> | null
  vendor?: Pick<User, "id" | "name" | "avatar" | "phone"> | null
  approvedBy?: Pick<User, "id" | "name" | "avatar"> | null
  rejectedBy?: Pick<User, "id" | "name" | "avatar"> | null
  checkedInBy?: Pick<User, "id" | "name" | "avatar"> | null
  checkedOutBy?: Pick<User, "id" | "name" | "avatar"> | null
}

export type PropertyStaffAuditAction =
  | "APPROVED"
  | "REJECTED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "COMPLETED"
  | "CANCELLED"

export type PropertyStaffAuditEntry = {
  id: string
  action: PropertyStaffAuditAction
  title: string
  description: string
  performedBy: { id: string; name: string; avatar?: string | null } | null
  performedAt: string
  isTeamMember: boolean
}

function auditActor(
  user: Pick<User, "id" | "name" | "avatar"> | null | undefined,
  hostVendorId: string
) {
  if (!user) return null
  return {
    id: user.id,
    name: user.name || "Staff",
    avatar: user.avatar ?? null,
    isTeamMember: user.id !== hostVendorId,
  }
}

export function buildPropertyBookingStaffAuditLog(
  booking: PropertyBookingWithRelations
): PropertyStaffAuditEntry[] {
  const hostVendorId = booking.vendorId
  const entries: PropertyStaffAuditEntry[] = []

  if (booking.approvedById && booking.approvedAt) {
    const actor = auditActor(booking.approvedBy, hostVendorId)
    entries.push({
      id: `approve-${booking.approvedAt.toISOString()}`,
      action: "APPROVED",
      title: "Reservation approved",
      description: actor
        ? `Authorized by ${actor.name}${actor.isTeamMember ? " (team member)" : " (host)"}`
        : "Reservation was approved",
      performedBy: actor
        ? { id: actor.id, name: actor.name, avatar: actor.avatar }
        : null,
      performedAt: booking.approvedAt.toISOString(),
      isTeamMember: actor?.isTeamMember ?? false,
    })
  }

  if (booking.rejectedById && booking.rejectedAt) {
    const actor = auditActor(booking.rejectedBy, hostVendorId)
    entries.push({
      id: `reject-${booking.rejectedAt.toISOString()}`,
      action: "REJECTED",
      title: "Reservation declined",
      description: actor
        ? `Declined by ${actor.name}${actor.isTeamMember ? " (team member)" : " (host)"}`
        : "Reservation was declined",
      performedBy: actor
        ? { id: actor.id, name: actor.name, avatar: actor.avatar }
        : null,
      performedAt: booking.rejectedAt.toISOString(),
      isTeamMember: actor?.isTeamMember ?? false,
    })
  }

  if (booking.checkedInById && booking.checkedInAt) {
    const actor = auditActor(booking.checkedInBy, hostVendorId)
    entries.push({
      id: `checkin-${booking.checkedInAt.toISOString()}`,
      action: "CHECKED_IN",
      title: "Guest checked in",
      description: actor
        ? `Processed by ${actor.name}${actor.isTeamMember ? " (team member)" : " (host)"}`
        : "Guest check-in recorded",
      performedBy: actor
        ? { id: actor.id, name: actor.name, avatar: actor.avatar }
        : null,
      performedAt: booking.checkedInAt.toISOString(),
      isTeamMember: actor?.isTeamMember ?? false,
    })
  }

  if (booking.checkedOutAt) {
    const actor = auditActor(booking.checkedOutBy, hostVendorId)
    const isCompleted = booking.status === "COMPLETED"
    entries.push({
      id: `checkout-${booking.checkedOutAt.toISOString()}`,
      action: isCompleted ? "COMPLETED" : "CHECKED_OUT",
      title: isCompleted ? "Stay completed" : "Guest checked out",
      description: actor
        ? `${isCompleted ? "Completed" : "Checked out"} by ${actor.name}${actor.isTeamMember ? " (team member)" : " (host)"}`
        : isCompleted
          ? "Stay marked complete"
          : "Check-out recorded",
      performedBy: actor
        ? { id: actor.id, name: actor.name, avatar: actor.avatar }
        : null,
      performedAt: booking.checkedOutAt.toISOString(),
      isTeamMember: actor?.isTeamMember ?? false,
    })
  } else if (booking.status === "COMPLETED" && booking.escrowReleasedAt) {
    const actor = auditActor(booking.checkedOutBy, hostVendorId)
    entries.push({
      id: `complete-${booking.escrowReleasedAt.toISOString()}`,
      action: "COMPLETED",
      title: "Stay completed",
      description: actor
        ? `Completed by ${actor.name}${actor.isTeamMember ? " (team member)" : " (host)"}`
        : "Stay marked complete",
      performedBy: actor
        ? { id: actor.id, name: actor.name, avatar: actor.avatar }
        : null,
      performedAt: booking.escrowReleasedAt.toISOString(),
      isTeamMember: actor?.isTeamMember ?? false,
    })
  }

  if (booking.cancelledAt) {
    entries.push({
      id: `cancel-${booking.cancelledAt.toISOString()}`,
      action: "CANCELLED",
      title: "Booking cancelled",
      description: booking.cancelReason || "Reservation was cancelled",
      performedBy: null,
      performedAt: booking.cancelledAt.toISOString(),
      isTeamMember: false,
    })
  }

  return entries.sort(
    (a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime()
  )
}

export function mapPropertyTypeToEnum(type: string): PropertyListingType {
  const t = String(type || "").toUpperCase().replace(/\s+/g, "_")
  const map: Record<string, PropertyListingType> = {
    APARTMENT: "APARTMENT",
    HOUSE: "HOUSE",
    HOTEL: "HOTEL",
    VILLA: "VILLA",
    RESORT: "HOTEL",
    RESORTS: "HOTEL",
    OVERWATER: "VILLA",
    CHALET: "HOUSE",
    SHARED_ROOM: "SHARED_ROOM",
    SHARED: "SHARED_ROOM",
  }
  return map[t] || "VILLA"
}

export function mapPropertyTypeFromEnum(type: PropertyListingType): string {
  const map: Record<PropertyListingType, string> = {
    APARTMENT: "Apartment",
    HOUSE: "House",
    HOTEL: "Hotel",
    VILLA: "Villa",
    SHARED_ROOM: "Shared room",
  }
  return map[type] || "Villa"
}

export function formatPropertyListingCard(listing: PropertyListingWithVendor) {
  const images = Array.isArray(listing.images) ? (listing.images as string[]) : []
  const amenities = Array.isArray(listing.amenities) ? (listing.amenities as string[]) : []
  const discountPct = Math.min(100, Math.max(0, listing.discountPercent))
  const nightly =
    discountPct > 0
      ? listing.nightlyRate * (1 - discountPct / 100)
      : listing.nightlyRate

  return {
    id: listing.id,
    name: listing.title,
    tagline: listing.tagline || "",
    city: listing.city,
    price: Math.round(nightly),
    rating: listing.rating,
    reviews: listing.reviewCount,
    badge: listing.badge || null,
    image: images[0] || null,
    images,
    amenities,
    sqm: listing.sqm || null,
    bedrooms: listing.bedrooms ?? 1,
    beds: listing.beds ?? 1,
    masterBeds: listing.masterBeds ?? 0,
    maxAdults: listing.maxAdults ?? 2,
    maxChildren: listing.maxChildren ?? 0,
    maxInfants: listing.maxInfants ?? 0,
    maxGuests: (listing.maxAdults ?? 2) + (listing.maxChildren ?? 0),
    coordinate:
      listing.latitude != null && listing.longitude != null
        ? { latitude: listing.latitude, longitude: listing.longitude }
        : null,
    status: listing.status.toLowerCase(),
    vendorId: listing.vendorId,
    type: listing.type,
    propertyTypeLabel: mapPropertyTypeFromEnum(listing.type),
    requiresApproval: listing.requiresApproval,
    requireGuidedSelfie: listing.requireGuidedSelfie,
    reviewCount: listing.reviewCount,
    nightlyRate: listing.nightlyRate,
    cleaningFee: listing.cleaningFee,
    securityDeposit: listing.securityDeposit,
    discountPercent: listing.discountPercent,
    videoUrl: listing.videoUrl,
    tourUrl: listing.tourUrl,
    description: listing.description,
    address: listing.address,
    state: listing.state,
    country: listing.country,
    guestTier: normalizePropertyGuestTier(listing.guestTier),
    host: listing.vendor
      ? {
          id: listing.vendor.id,
          name: listing.vendor.name,
          avatar: listing.vendor.avatar,
        }
      : null,
  }
}

export function formatVendorManagedProperty(
  listing: PropertyListing,
  stats?: { staysHosted?: number; occupancyRate?: number }
) {
  const images = Array.isArray(listing.images) ? (listing.images as string[]) : []
  return {
    id: listing.id,
    title: listing.title,
    city: listing.city,
    nightlyRate: listing.nightlyRate,
    status: listing.status === "ACTIVE" ? "active" : "maint",
    imageUrl: images[0] || null,
    bookingsCount: stats?.staysHosted ?? 0,
    staysHosted: stats?.staysHosted ?? 0,
    occupancyRate: stats?.occupancyRate ?? 0,
    rating: listing.rating,
  }
}

export function formatBookingRequestRow(booking: PropertyBookingWithRelations) {
  const customer = booking.customer
  const listing = booking.listing
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

  let tabStatus: "Pending" | "Approved" | "Rejected" = "Pending"
  if (booking.status === "PENDING_APPROVAL" || booking.status === "PENDING_PAYMENT")
    tabStatus = "Pending"
  else if (
        booking.status === "CONFIRMED" ||
        booking.status === "CHECKED_IN" ||
        booking.status === "ACTIVE" ||
        booking.status === "COMPLETED"
      )
    tabStatus = "Approved"
  else if (booking.status === "REJECTED") tabStatus = "Rejected"

  return {
    id: booking.id,
    bookingNumber: booking.bookingNumber,
    guestName: customer?.name || "Guest",
    guestAvatar: customer?.avatar || null,
    tier: normalizePropertyGuestTier(booking.guestTier || listing?.guestTier),
    checkIn: fmt(booking.checkIn),
    checkOut: fmt(booking.checkOut),
    checkInISO: booking.checkIn.toISOString().slice(0, 10),
    checkOutISO: booking.checkOut.toISOString().slice(0, 10),
    nights: booking.nights,
    guests: `${booking.adults} Adult${booking.adults !== 1 ? "s" : ""}${
      booking.children > 0 ? ` · ${booking.children} Child${booking.children !== 1 ? "ren" : ""}` : ""
    }`,
    suite: listing?.title || "Property",
    totalPrice: booking.totalAmount,
    subtotal: booking.subtotal,
    cleaningFee: booking.cleaningFee,
    securityDeposit: booking.securityDeposit,
    platformFee: booking.platformFee,
    submittedTime: booking.createdAt.toISOString(),
    notes: booking.guestNotes || undefined,
    status: tabStatus,
    rawStatus: booking.status,
    displayStatus:
      booking.status === "CONFIRMED"
        ? "Confirmed"
        : booking.status === "CHECKED_IN" || booking.status === "ACTIVE"
          ? "In Stay"
            : booking.status === "COMPLETED"
              ? "Completed"
              : booking.status === "PENDING_APPROVAL"
                ? "Pending Approval"
                : booking.status === "PENDING_PAYMENT"
                  ? "Pending Payment"
                  : booking.status,
    listingId: booking.listingId,
    approvedBy: booking.approvedBy
      ? { id: booking.approvedBy.id, name: booking.approvedBy.name, avatar: booking.approvedBy.avatar }
      : null,
    approvedByName: booking.approvedBy?.name || null,
    rejectedByName: booking.rejectedBy?.name || null,
    checkedInByName: booking.checkedInBy?.name || null,
    checkedOutByName: booking.checkedOutBy?.name || null,
    approvedAt: booking.approvedAt?.toISOString() || null,
    rejectedAt: booking.rejectedAt?.toISOString() || null,
    checkedInAt: booking.checkedInAt?.toISOString() || null,
    checkedOutAt: booking.checkedOutAt?.toISOString() || null,
    escrowReleasedAt: booking.escrowReleasedAt?.toISOString() || null,
    cancelledAt: booking.cancelledAt?.toISOString() || null,
    cancelReason: booking.cancelReason || null,
    rejectedBy: booking.rejectedBy
      ? { id: booking.rejectedBy.id, name: booking.rejectedBy.name, avatar: booking.rejectedBy.avatar }
      : null,
    checkedInBy: booking.checkedInBy
      ? { id: booking.checkedInBy.id, name: booking.checkedInBy.name, avatar: booking.checkedInBy.avatar }
      : null,
    checkedOutBy: booking.checkedOutBy
      ? { id: booking.checkedOutBy.id, name: booking.checkedOutBy.name, avatar: booking.checkedOutBy.avatar }
      : null,
    staffAuditLog: buildPropertyBookingStaffAuditLog(booking),
  }
}
