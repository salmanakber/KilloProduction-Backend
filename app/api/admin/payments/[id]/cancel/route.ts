import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import type { Prisma } from "@prisma/client"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireAdmin()
  if (error) return error

  try {
    const body = await request.json().catch(() => ({}))
    const reason = typeof body?.reason === "string" ? body.reason : "Admin cancelled"

    const tx = await prisma.walletTransaction.findUnique({ where: { id: params.id } })
    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }
    if (tx.status !== "PENDING") {
      return NextResponse.json({ error: "Only pending wallet transactions can be cancelled" }, { status: 400 })
    }

    const prevMeta =
      tx.metadata && typeof tx.metadata === "object" && !Array.isArray(tx.metadata)
        ? (tx.metadata as Record<string, unknown>)
        : {}
    const metadata: Prisma.InputJsonValue = {
      ...prevMeta,
      adminCancelledAt: new Date().toISOString(),
      adminCancelledBy: session!.id,
      adminCancelReason: reason,
    }

    await prisma.walletTransaction.update({
      where: { id: params.id },
      data: { status: "CANCELLED", metadata },
    })

    await prisma.auditLog.create({
      data: {
        performedBy: session!.id,
        action: "ADMIN_CANCEL_WALLET_TX",
        entityType: "WalletTransaction",
        entityId: params.id,
        details: { reason },
      },
    })

    return NextResponse.json({ success: true, message: "Transaction cancelled" })
  } catch (e) {
    console.error("Cancel wallet tx:", e)
    return NextResponse.json({ error: "Failed to cancel" }, { status: 500 })
  }
}
