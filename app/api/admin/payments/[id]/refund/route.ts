import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import type { Prisma } from "@prisma/client"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireAdmin()
  if (error) return error

  try {
    const body = await request.json().catch(() => ({}))
    const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : "Admin refund request"

    const tx = await prisma.walletTransaction.findUnique({ where: { id: params.id } })
    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }
    if (tx.status !== "COMPLETED") {
      return NextResponse.json({ error: "Only completed transactions can be flagged for refund review" }, { status: 400 })
    }

    const prevMeta =
      tx.metadata && typeof tx.metadata === "object" && !Array.isArray(tx.metadata)
        ? (tx.metadata as Record<string, unknown>)
        : {}
    const metadata: Prisma.InputJsonValue = {
      ...prevMeta,
      adminRefundRequestedAt: new Date().toISOString(),
      adminRefundRequestedBy: session!.id,
      adminRefundReason: reason,
    }

    await prisma.walletTransaction.update({
      where: { id: params.id },
      data: { metadata },
    })

    await prisma.auditLog.create({
      data: {
        performedBy: session!.id,
        action: "ADMIN_REQUEST_WALLET_REFUND",
        entityType: "WalletTransaction",
        entityId: params.id,
        details: { reason, amount: tx.amount },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Refund request recorded on transaction (process payout separately if needed)",
    })
  } catch (e) {
    console.error("Refund wallet tx:", e)
    return NextResponse.json({ error: "Failed to record refund" }, { status: 500 })
  }
}
