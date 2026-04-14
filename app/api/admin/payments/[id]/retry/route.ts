import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import type { Prisma } from "@prisma/client"

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireAdmin()
  if (error) return error

  try {
    const tx = await prisma.walletTransaction.findUnique({ where: { id: params.id } })
    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }
    if (tx.status !== "FAILED") {
      return NextResponse.json({ error: "Only failed transactions can be marked for retry" }, { status: 400 })
    }

    const prevMeta =
      tx.metadata && typeof tx.metadata === "object" && !Array.isArray(tx.metadata)
        ? (tx.metadata as Record<string, unknown>)
        : {}
    const metadata: Prisma.InputJsonValue = {
      ...prevMeta,
      adminRetryAt: new Date().toISOString(),
      adminRetryBy: session!.id,
    }

    await prisma.walletTransaction.update({
      where: { id: params.id },
      data: { status: "PENDING", metadata },
    })

    await prisma.auditLog.create({
      data: {
        performedBy: session!.id,
        action: "ADMIN_RETRY_WALLET_TX",
        entityType: "WalletTransaction",
        entityId: params.id,
        details: {},
      },
    })

    return NextResponse.json({ success: true, message: "Transaction reset to pending for retry" })
  } catch (e) {
    console.error("Retry wallet tx:", e)
    return NextResponse.json({ error: "Failed to retry" }, { status: 500 })
  }
}
