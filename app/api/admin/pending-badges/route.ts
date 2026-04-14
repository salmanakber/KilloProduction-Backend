import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

/**
 * Returns pending task counts keyed by admin sidebar hrefs.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await prisma.user.findUnique({ where: { id: session.id } })
    if (admin?.role !== "ADMIN" && admin?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const [
      mechanicKyc,
      pharmacyKyc,
      autoPartsKyc,
      riderPending,
      foodKyc,
      groceryKyc,
      wholesalerKyc,
      ordersPending,
      withdrawalsPending,
      ticketsOpen,
      specialOfferPending,
      usersPending,
      vendorOfferPendingFood,
      vendorOfferPendingGrocery,
    ] = await Promise.all([
      prisma.mechanicProfile.count({ where: { isVerified: false } }),
      prisma.pharmacy.count({ where: { status: "PENDING" } }),
      prisma.autoPartsStore.count({ where: { isVerified: false } }),
      prisma.user.count({
        where: {
          role: "RIDER",
          riderProfile: { is: { isApproved: false } },
        },
      }),
      prisma.restaurant.count({ where: { isVerified: false } }),
      prisma.groceryStore.count({ where: { isVerified: false } }),
      prisma.wholesaler.count({ where: { isVerified: false } }),
      prisma.order.count({ where: { status: "PENDING" } }),
      prisma.vendorWithdrawal.count({ where: { status: "PENDING" } }),
      prisma.supportTicket.count({ where: { status: "OPEN" } }),
      prisma.specialOfferSubmission.count({ where: { status: "PENDING" } }),
      prisma.user.count({
        where: {
          status: "PENDING",
          role: { notIn: ["ADMIN", "SUPER_ADMIN"] },
        },
      }),
      prisma.restaurantOffer.count({ where: { approvalStatus: "PENDING", promoKind: { in: ["MYSTERY", "FLASH"] } } }),
      prisma.groceryOffer.count({ where: { approvalStatus: "PENDING", promoKind: { in: ["MYSTERY", "FLASH"] } } }),
    ])

    const kycTotal =
      mechanicKyc +
      pharmacyKyc +
      autoPartsKyc +
      riderPending +
      foodKyc +
      groceryKyc +
      wholesalerKyc

    const vendorManagementTotal =
      autoPartsKyc + pharmacyKyc + foodKyc + groceryKyc + wholesalerKyc + mechanicKyc

    const counts: Record<string, number> = {
      "/admin/kyc": kycTotal,
      "/admin/users": usersPending,
      "/admin/orders": ordersPending,
      "/admin/payments": withdrawalsPending,
      "/admin/modules/vendor": vendorManagementTotal,
      "/admin/modules/auto-parts": autoPartsKyc,
      "/admin/modules/pharmacy": pharmacyKyc,
      "/admin/modules/food/all": foodKyc,
      "/admin/modules/grocery": groceryKyc,
      "/admin/modules/wholesaler": wholesalerKyc,
      "/admin/modules/mechanic": mechanicKyc,
      "/admin/modules/rider": riderPending,
      "/admin/modules/rider/all": riderPending,
      "/admin/modules/rider/pending": riderPending,
      "/admin/complaints": ticketsOpen,
      "/admin/special-offers": specialOfferPending,
      "/admin/special-offers/pending": specialOfferPending,
      "/admin/vendor-offers": vendorOfferPendingFood + vendorOfferPendingGrocery,
      "/admin/money-app-admin/payouts": withdrawalsPending,
      "/admin/money-app-admin": withdrawalsPending,
    }

    return NextResponse.json({ counts })
  } catch (e) {
    console.error("pending-badges:", e)
    return NextResponse.json({ error: "Failed to load badges" }, { status: 500 })
  }
}
