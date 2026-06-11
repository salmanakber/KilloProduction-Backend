import { prisma } from "@/lib/prisma"
import type { PropertyHostAccessRole } from "@prisma/client"

export type PropertyHostContext = {
  hostVendorId: string
  accessRole: PropertyHostAccessRole | "OWNER"
  canManageBookings: boolean
  canManageListings: boolean
  canManageTeam: boolean
  canManageProfile: boolean
}

export const PROPERTY_BOOKINGS_ONLY_FORBIDDEN =
  "Booking-only team members can only manage reservations. Contact your host admin for property access."

export function listingsAccessDenied() {
  return { error: PROPERTY_BOOKINGS_ONLY_FORBIDDEN, code: "PROPERTY_BOOKINGS_ONLY" }
}

export async function assertCanManagePropertyListings(userId: string) {
  const ctx = await getPropertyHostContext(userId)
  if (!ctx?.canManageListings) {
    return { ctx: null as PropertyHostContext | null, denied: true as const }
  }
  return { ctx, denied: false as const }
}

export async function assertCanManageHostBookings(userId: string) {
  const ctx = await getPropertyHostContext(userId)
  if (!ctx?.canManageBookings) {
    return { ctx: null as PropertyHostContext | null, denied: true as const }
  }
  return { ctx, denied: false as const }
}

export async function resolvePropertyHostVendorId(userId: string): Promise<string | null> {
  const membership = await prisma.propertyHostMember.findUnique({
    where: { userId },
    select: { hostVendorId: true, status: true },
  })
  if (membership?.status === "ACTIVE") return membership.hostVendorId

  const listing = await prisma.propertyListing.findFirst({
    where: { vendorId: userId },
    select: { vendorId: true },
  })
  if (listing) return userId

  const vp = await prisma.vendorProfile.findUnique({
    where: { userId },
    select: { businessType: true },
  })
  if (String(vp?.businessType || "").toLowerCase().includes("property")) return userId

  return null
}

export async function getPropertyHostContext(userId: string): Promise<PropertyHostContext | null> {
  const membership = await prisma.propertyHostMember.findUnique({
    where: { userId },
  })
  if (membership && membership.status === "ACTIVE") {
    const full = membership.accessRole === "FULL_ACCESS"
    return {
      hostVendorId: membership.hostVendorId,
      accessRole: membership.accessRole,
      canManageBookings: true,
      canManageListings: full,
      canManageTeam: full,
      canManageProfile: full,
    }
  }

  const hostVendorId = await resolvePropertyHostVendorId(userId)
  if (!hostVendorId || hostVendorId !== userId) return null

  return {
    hostVendorId: userId,
    accessRole: "OWNER",
    canManageBookings: true,
    canManageListings: true,
    canManageTeam: true,
    canManageProfile: true,
  }
}

export function propertyCheckInQrValue(bookingId: string): string {
  return `killo-property:${bookingId}`
}

export function parsePropertyCheckInQr(raw: string): string | null {
  const s = String(raw || "").trim()
  if (!s) return null
  if (s.startsWith("killo-property:")) return s.slice("killo-property:".length).trim() || null
  if (s.startsWith("PROPERTY_CHECKIN:")) return s.slice("PROPERTY_CHECKIN:".length).trim() || null
  return s.length >= 8 ? s : null
}
