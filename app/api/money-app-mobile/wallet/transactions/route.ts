import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 30), 1), 100)
    const offset = Math.max(Number(searchParams.get("offset") || 0), 0)
    const currency = searchParams.get("currency")?.trim().toUpperCase()
    const type = searchParams.get("type")?.trim().toUpperCase()

    const where = {
      userId: user.id,
      ...(currency ? { currency } : {}),
      ...(type && ["CREDIT", "WITHDRAWAL", "DEBIT", "ADJUSTMENT"].includes(type)
        ? { type: type as "CREDIT" | "WITHDRAWAL" | "DEBIT" | "ADJUSTMENT" }
        : {}),
    }

    const [transactions, total] = await Promise.all([
      prisma.moneyTransferWalletTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          transfer: {
            select: {
              id: true,
              reference: true,
              amount: true,
              currency: true,
              receiveAmount: true,
              receiveCurrency: true,
              exchangeRate: true,
              sender: { select: { name: true, email: true } },
              receiver: { select: { name: true, email: true } },
            },
          },
        },
      }),
      prisma.moneyTransferWalletTransaction.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        currency: t.currency,
        description: t.description,
        reference: t.reference,
        transferId: t.transferId,
        transfer: t.transfer
          ? {
              id: t.transfer.id,
              reference: t.transfer.reference,
              sendAmount: t.transfer.amount,
              sendCurrency: t.transfer.currency,
              receiveAmount: t.transfer.receiveAmount,
              receiveCurrency: t.transfer.receiveCurrency,
              exchangeRate: t.transfer.exchangeRate,
              senderName: t.transfer.sender?.name || t.transfer.sender?.email,
              receiverName:
                t.transfer.receiver?.name || t.transfer.receiver?.email || undefined,
            }
          : null,
        createdAt: t.createdAt,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + transactions.length < total,
      },
    })
  } catch (error: any) {
    console.error("Wallet transactions GET:", error)
    return NextResponse.json(
      { error: error.message || "Failed to load transactions" },
      { status: 500 },
    )
  }
}
