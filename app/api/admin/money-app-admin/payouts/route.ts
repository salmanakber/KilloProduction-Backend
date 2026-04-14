import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN") {
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
        { paystackReference: { contains: search, mode: "insensitive" } },
        { paystackTransferCode: { contains: search, mode: "insensitive" } },
        { accountNumber: { contains: search, mode: "insensitive" } },
        { accountName: { contains: search, mode: "insensitive" } },
        { transfer: { reference: { contains: search, mode: "insensitive" } } },
      ]
    }

    const [payouts, total] = await Promise.all([
      prisma.moneyTransferPayout.findMany({
        where,
        include: {
          transfer: {
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
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.moneyTransferPayout.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      payouts: payouts.map((payout) => ({
        id: payout.id,
        transfer: {
          id: payout.transfer.id,
          reference: payout.transfer.reference,
          sender: {
            id: payout.transfer.sender.id,
            name: payout.transfer.sender.name || payout.transfer.sender.email || payout.transfer.sender.phone,
          },
          receiver: {
            id: payout.transfer.receiver.id,
            name: payout.transfer.receiver.name || payout.transfer.receiver.email || payout.transfer.receiver.phone,
          },
        },
        amount: payout.amount / 100, // Convert from kobo
        currency: payout.currency,
        status: payout.status,
        bankName: payout.bankName,
        accountNumber: payout.accountNumber,
        accountName: payout.accountName,
        bankCode: payout.bankCode,
        paystackTransferCode: payout.paystackTransferCode,
        paystackReference: payout.paystackReference,
        failureReason: payout.failureReason,
        retryCount: payout.retryCount,
        createdAt: payout.createdAt,
        processedAt: payout.processedAt,
        completedAt: payout.completedAt,
        failedAt: payout.failedAt,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    })
  } catch (error: any) {
    console.error("Error fetching payouts:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch payouts" },
      { status: 500 }
    )
  }
}
