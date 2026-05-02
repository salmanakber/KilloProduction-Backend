import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")
    const search = searchParams.get("search")

    const where: any = {}

    if (status) {
      where.status = status
    }

    if (search) {
      where.OR = [
        { reference: { contains: search, mode: "insensitive" } },
        { sender: { name: { contains: search, mode: "insensitive" } } },
        { sender: { email: { contains: search, mode: "insensitive" } } },
        { sender: { phone: { contains: search, mode: "insensitive" } } },
        { receiver: { name: { contains: search, mode: "insensitive" } } },
        { receiver: { email: { contains: search, mode: "insensitive" } } },
        { receiver: { phone: { contains: search, mode: "insensitive" } } },
      ]
    }

    const [transfers, total] = await Promise.all([
      prisma.moneyTransfer.findMany({
        where,
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          payout: {
            select: {
              id: true,
              status: true,
              paystackReference: true,
              failureReason: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.moneyTransfer.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      transfers: transfers.map((transfer) => ({
        id: transfer.id,
        reference: transfer.reference,
        sender: {
          id: transfer.sender.id,
          name: transfer.sender.name || transfer.sender.email || transfer.sender.phone,
          email: transfer.sender.email,
          phone: transfer.sender.phone,
        },
        receiver: {
          id: transfer.receiver.id,
          name: transfer.receiver.name || transfer.receiver.email || transfer.receiver.phone,
          email: transfer.receiver.email,
          phone: transfer.receiver.phone,
        },
        amount: transfer.amount,
        currency: transfer.currency,
        ngnAmount: transfer.ngnAmount,
        exchangeRate: transfer.exchangeRate,
        receiveAmount: transfer.receiveAmount,
        receiveCurrency: transfer.receiveCurrency,
        baseCurrency: transfer.baseCurrency,
        baseAmount: transfer.baseAmount,
        midMarketRate: transfer.midMarketRate,
        customerRate: transfer.customerRate,
        markupPercentage: transfer.markupPercentage,
        rateSource: transfer.rateSource,
        fee: transfer.fee,
        feeBase: transfer.feeBase,
        fxMarginSettlement: transfer.fxMarginSettlement,
        fxMarginBase: transfer.fxMarginBase,
        status: transfer.status,
        stripePaymentIntentId: transfer.stripePaymentIntentId,
        payout: transfer.payout,
        description: transfer.description,
        createdAt: transfer.createdAt,
        completedAt: transfer.completedAt,
        failedAt: transfer.failedAt,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    })
  } catch (error: any) {
    console.error("Error fetching transactions:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch transactions" },
      { status: 500 }
    )
  }
}
