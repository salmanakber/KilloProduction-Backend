import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireAdmin()
  if (error) return error

  try {
    const body = await request.json().catch(() => ({}))
    const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : "No reason provided"

    const withdrawal = await prisma.vendorWithdrawal.findUnique({
      where: { id: params.id },
    })

    if (!withdrawal) {
      return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 })
    }

    if (withdrawal.status !== "PENDING") {
      return NextResponse.json({ error: "Only pending withdrawals can be rejected" }, { status: 400 })
    }

    const admin = await prisma.user.findUnique({
      where: { id: session!.id },
      select: { name: true, email: true },
    })
    const processedByLabel = admin?.name || admin?.email || session!.id

    const updated = await prisma.vendorWithdrawal.update({
      where: { id: params.id },
      data: {
        status: "REJECTED",
        rejectedDate: new Date(),
        rejectionReason: reason,
        processedBy: processedByLabel,
        processedDate: new Date(),
      },
    })

    await prisma.auditLog.create({
      data: {
        performedBy: session!.id,
        action: "ADMIN_REJECT_VENDOR_WITHDRAWAL",
        entityType: "VendorWithdrawal",
        entityId: updated.id,
        details: { vendorId: withdrawal.vendorId, amount: withdrawal.amount, reason },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Withdrawal rejected",
      withdrawal: {
        id: updated.id,
        status: updated.status,
        processedAt: updated.rejectedDate?.toISOString() ?? null,
        processedBy: updated.processedBy,
        rejectionReason: updated.rejectionReason,
      },
    })
  } catch (e) {
    console.error("Reject withdrawal:", e)
    return NextResponse.json({ error: "Failed to reject withdrawal" }, { status: 500 })
  }
}
