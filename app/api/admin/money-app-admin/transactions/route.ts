import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MoneyAdminAuthError, requireMoneyTransferAdmin } from "@/lib/money-transfer-admin"

export async function GET(request: NextRequest) {
  try {
    await requireMoneyTransferAdmin(request)

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const limit = parseInt(searchParams.get("limit") || "50")
    const page = parseInt(searchParams.get("page") || "1")
    const offsetParam = searchParams.get("offset")
    const offset = offsetParam != null ? parseInt(offsetParam) : (page - 1) * limit
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
        page: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: offset + limit < total,
      },
    })
  } catch (error: unknown) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Error fetching transactions:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch transactions" },
      { status: 500 }
    )
  }
}
