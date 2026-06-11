import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { formatVendorManagedProperty, formatBookingRequestRow } from "@/lib/property-types"
import { getPropertyHostContext } from "@/lib/property-host-resolve"

const ACTIVE_STATUSES = ["CONFIRMED", "CHECKED_IN", "ACTIVE"] as const
const PROPERTY_ESCROW_TYPE = "PROPERTY_ESCROW"

function isPropertyEscrowWalletTx(tx: {
  metadata: unknown
  description?: string | null
}) {
  const meta = tx.metadata as { module?: string; transactionType?: string } | null
  return (
    meta?.module === "PROPERTY" &&
    (meta?.transactionType === PROPERTY_ESCROW_TYPE ||
      String(tx.description || "").toLowerCase().includes("property booking"))
  )
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const ctx = await getPropertyHostContext(user.id)
    if (!ctx) {
      return NextResponse.json({ error: "Not a property host account" }, { status: 403 })
    }

    const hostVendorId = ctx.hostVendorId
    const bookingsOnly = !ctx.canManageListings

    const [
      listings,
      pendingBookings,
      activeBookings,
      completedBookings,
      recentPending,
      activeStayRows,
      recentCompleted,
      recentWalletTx,
      hostUser,
    ] = await Promise.all([
      prisma.propertyListing.findMany({
        where: { vendorId: hostVendorId, status: { not: "INACTIVE" } },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.propertyBooking.count({
        where: { vendorId: hostVendorId, status: "PENDING_APPROVAL" },
      }),
      prisma.propertyBooking.count({
        where: { vendorId: hostVendorId, status: { in: [...ACTIVE_STATUSES] } },
      }),
      prisma.propertyBooking.count({
        where: { vendorId: hostVendorId, status: "COMPLETED" },
      }),
      prisma.propertyBooking.findMany({
        where: { vendorId: hostVendorId, status: "PENDING_APPROVAL" },
        include: {
          customer: { select: { id: true, name: true, avatar: true } },
          listing: { select: { title: true, guestTier: true } },
          approvedBy: { select: { id: true, name: true, avatar: true } },
          rejectedBy: { select: { id: true, name: true, avatar: true } },
          checkedInBy: { select: { id: true, name: true, avatar: true } },
          checkedOutBy: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.propertyBooking.findMany({
        where: { vendorId: hostVendorId, status: { in: [...ACTIVE_STATUSES] } },
        include: {
          customer: { select: { id: true, name: true, avatar: true } },
          listing: { select: { title: true, guestTier: true } },
          approvedBy: { select: { id: true, name: true, avatar: true } },
          rejectedBy: { select: { id: true, name: true, avatar: true } },
          checkedInBy: { select: { id: true, name: true, avatar: true } },
          checkedOutBy: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: { checkIn: "asc" },
        take: 8,
      }),
      prisma.propertyBooking.findMany({
        where: {
          vendorId: hostVendorId,
          status: { in: ["COMPLETED", "ACTIVE", "CHECKED_IN", "CONFIRMED", "CANCELLED", "REJECTED"] },
        },
        select: {
          id: true,
          bookingNumber: true,
          status: true,
          checkIn: true,
          checkOut: true,
          totalAmount: true,
          checkedInAt: true,
          approvedAt: true,
          createdAt: true,
          updatedAt: true,
          customer: { select: { name: true } },
          listing: { select: { title: true } },
          approvedBy: { select: { id: true, name: true } },
          rejectedBy: { select: { id: true, name: true } },
          checkedInBy: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 12,
      }),
      prisma.walletTransaction.findMany({
        where: { userId: hostVendorId, status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.user.findUnique({
        where: { id: hostVendorId },
        select: { name: true, vendorProfile: { select: { businessName: true } } },
      }),
    ])

    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11)
    twelveMonthsAgo.setDate(1)
    twelveMonthsAgo.setHours(0, 0, 0, 0)

    const walletRows = await prisma.walletTransaction.findMany({
      where: {
        userId: hostVendorId,
        type: "CREDIT",
        OR: [
          { status: "COMPLETED", createdAt: { gte: twelveMonthsAgo } },
          { status: "PENDING" },
        ],
      },
      select: {
        amount: true,
        status: true,
        metadata: true,
        description: true,
        createdAt: true,
      },
    })

    const propertyWalletRows = walletRows.filter(isPropertyEscrowWalletTx)
    const escrowPending = propertyWalletRows
      .filter((tx) => tx.status === "PENDING")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0)

    const now = new Date()
    const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`
    const monthEarnings = propertyWalletRows
      .filter((tx) => {
        if (tx.status !== "COMPLETED") return false
        const at = tx.createdAt
        return `${at.getFullYear()}-${at.getMonth()}` === currentMonthKey
      })
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0)

    const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const monthlyMap = new Map<string, number>()
    for (let i = 11; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      monthlyMap.set(key, 0)
    }
    for (const tx of propertyWalletRows) {
      if (tx.status !== "COMPLETED") continue
      const at = tx.updatedAt || tx.createdAt
      const key = `${at.getFullYear()}-${at.getMonth()}`
      if (monthlyMap.has(key)) {
        monthlyMap.set(key, (monthlyMap.get(key) || 0) + Number(tx.amount || 0))
      }
    }
    const monthlyEarnings = Array.from(monthlyMap.entries()).map(([key, earnings]) => {
      const [, monthStr] = key.split("-")
      const month = Number(monthStr)
      return { month: monthLabels[month] || "", earnings: Math.round(earnings * 100) / 100 }
    })

    const ids = listings.map((l) => l.id)
    const stayGroups =
      ids.length > 0
        ? await prisma.propertyBooking.groupBy({
            by: ["listingId"],
            where: {
              listingId: { in: ids },
              status: { in: ["COMPLETED", "ACTIVE", "CONFIRMED", "CHECKED_IN"] },
            },
            _count: { id: true },
          })
        : []
    const activeGroups =
      ids.length > 0
        ? await prisma.propertyBooking.groupBy({
            by: ["listingId"],
            where: {
              listingId: { in: ids },
              status: { in: [...ACTIVE_STATUSES] },
            },
            _count: { id: true },
          })
        : []
    const stayMap = new Map(stayGroups.map((g) => [g.listingId, g._count.id]))
    const activeMap = new Map(activeGroups.map((g) => [g.listingId, g._count.id]))

    const fmtDate = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

    const recentActivity = recentCompleted.map((b) => {
      let kind = "BOOKING_UPDATED"
      let title = `Booking ${b.bookingNumber}`
      let detail = `${b.listing?.title || "Property"} · ${b.status}`
      const at = b.checkedInAt || b.approvedAt || b.updatedAt || b.createdAt

      if (b.status === "ACTIVE" || b.status === "CHECKED_IN") {
        kind = "CHECKED_IN"
        title = "Guest checked in"
        detail = `${b.customer?.name || "Guest"} · ${b.listing?.title || "Property"}`
      } else if (b.status === "CONFIRMED" && b.approvedAt) {
        kind = "BOOKING_CONFIRMED"
        title = "Booking confirmed"
        detail = `${b.customer?.name || "Guest"} · ${fmtDate(b.checkIn)} – ${fmtDate(b.checkOut)}`
      } else if (b.status === "COMPLETED") {
        kind = "STAY_COMPLETED"
        title = "Stay completed"
        detail = `${b.listing?.title || "Property"} · ${fmtDate(b.checkOut)}`
      } else if (b.status === "CANCELLED" || b.status === "REJECTED") {
        kind = "BOOKING_CANCELLED"
        title = "Booking cancelled"
      }

      const performedBy =
        b.checkedInBy?.name ||
        b.approvedBy?.name ||
        b.rejectedBy?.name ||
        null
      const performedById =
        b.checkedInBy?.id ||
        b.approvedBy?.id ||
        b.rejectedBy?.id ||
        null

      return {
        id: b.id,
        kind,
        title,
        detail,
        amount: b.totalAmount,
        status: b.status,
        at: at.toISOString(),
        performedBy,
        performedById,
        isTeamAction: performedById != null && performedById !== hostVendorId,
      }
    })

    const recentPayments = recentWalletTx
      .filter((tx) => {
        const meta = tx.metadata as { module?: string; transactionType?: string } | null
        return meta?.module === "PROPERTY" || String(tx.description || "").includes("property")
      })
      .map((tx) => ({
        id: tx.id,
        amount: tx.amount,
        description: tx.description,
        status: tx.status,
        at: (tx.updatedAt || tx.createdAt).toISOString(),
      }))

    return NextResponse.json({
      success: true,
      host: {
        name: hostUser?.vendorProfile?.businessName || hostUser?.name || "Host",
      },
      propertyHostAccess: ctx.accessRole,
      stats: {
        propertiesCount: bookingsOnly ? 0 : listings.length,
        pendingRequests: pendingBookings,
        activeStays: activeBookings,
        completedStays: completedBookings,
        monthEarnings: bookingsOnly ? 0 : Math.round(monthEarnings * 100) / 100,
        escrowPending: bookingsOnly ? 0 : Math.round(escrowPending * 100) / 100,
      },
      properties: bookingsOnly
        ? []
        : listings.map((listing) => {
            const stays = stayMap.get(listing.id) || 0
            const active = activeMap.get(listing.id) || 0
            const occupancyRate = Math.min(100, Math.round((active / Math.max(1, stays || 1)) * 100))
            return formatVendorManagedProperty(listing, { staysHosted: stays, occupancyRate })
          }),
      bookings: recentPending.map((b) => formatBookingRequestRow(b)),
      activeBookings: activeStayRows.map((b) => formatBookingRequestRow(b)),
      recentActivity: bookingsOnly
        ? recentActivity.filter((a) => a.kind === "booking")
        : recentActivity,
      recentPayments: bookingsOnly ? [] : recentPayments,
      monthlyEarnings: bookingsOnly ? [] : monthlyEarnings,
    })
  } catch (error) {
    console.error("Property vendor dashboard error:", error)
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 })
  }
}
