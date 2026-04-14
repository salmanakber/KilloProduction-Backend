import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireAdmin()
  if (error) return error

  try {
    const withdrawal = await prisma.vendorWithdrawal.findUnique({
      where: { id: params.id },
      include: { vendor: { select: { id: true, name: true } } },
    })

    if (!withdrawal) {
      return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 })
    }

    if (withdrawal.status !== "PENDING") {
      return NextResponse.json({ error: "Only pending withdrawals can be approved" }, { status: 400 })
    }

    const admin = await prisma.user.findUnique({
      where: { id: session!.id },
      select: { name: true, email: true },
    })
    const processedByLabel = admin?.name || admin?.email || session!.id

    const updated = await prisma.vendorWithdrawal.update({
      where: { id: params.id },
      data: {
        status: "APPROVED",
        processedDate: new Date(),
        processedBy: processedByLabel,
        rejectionReason: null,
        rejectedDate: null,
      },
    })

    await prisma.auditLog.create({
      data: {
        performedBy: session!.id,
        action: "ADMIN_APPROVE_VENDOR_WITHDRAWAL",
        entityType: "VendorWithdrawal",
        entityId: updated.id,
        details: { vendorId: withdrawal.vendorId, amount: withdrawal.amount },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Withdrawal approved",
      withdrawal: {
        id: updated.id,
        status: updated.status,
        processedAt: updated.processedDate?.toISOString() ?? null,
        processedBy: updated.processedBy,
      },
    })
  } catch (e) {
    console.error("Approve withdrawal:", e)
    return NextResponse.json({ error: "Failed to approve withdrawal" }, { status: 500 })
  }
}
