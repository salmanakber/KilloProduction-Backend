import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import {
  applyBookingHostKycApproved,
  applyBookingHostKycRejected,
  createKycRejectionRecord,
  ensureUserWalletAndProfile,
} from "@/lib/kyc-admin-status-sync"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await authenticateRequest(request)
    if (!admin || !["ADMIN", "SUPER_ADMIN"].includes(admin.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { action, reason } = await request.json()
    const host = await prisma.user.findUnique({
      where: { id: params.id },
      include: { vendorProfile: true },
    })
    if (!host || host.role !== "VENDOR" || !host.vendorProfile) {
      return NextResponse.json({ error: "Booking host not found" }, { status: 404 })
    }

    if (action === "approve") {
      await applyBookingHostKycApproved(host.id)
      await ensureUserWalletAndProfile(host.id, host.name || "Host")
      return NextResponse.json({ success: true, status: "APPROVED" })
    }

    if (action === "reject") {
      await applyBookingHostKycRejected(host.id, reason)
      if (reason?.trim()) {
        await createKycRejectionRecord({
          entityType: "BOOKING_HOST",
          entityId: host.id,
          userId: host.id,
          rejectionReason: reason.trim(),
          rejectedBy: admin.id,
        })
      }
      return NextResponse.json({ success: true, status: "REJECTED", reason: reason || null })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Booking host KYC error:", error)
    return NextResponse.json({ error: "Failed to process KYC" }, { status: 500 })
  }
}
