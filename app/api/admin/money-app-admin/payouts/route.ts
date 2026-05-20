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
    const offset = (page - 1) * limit
    const search = searchParams.get("search")
    const kind = searchParams.get("kind") // wallet | transfer | all

    const transferWhere: Record<string, unknown> = {}
    const walletWhere: Record<string, unknown> = {}

    if (status) {
      transferWhere.status = status
      walletWhere.status = status === "SUCCESS" ? "COMPLETED" : status
    }

    if (search) {
      transferWhere.OR = [
        { paystackReference: { contains: search, mode: "insensitive" } },
        { accountNumber: { contains: search, mode: "insensitive" } },
        { transfer: { reference: { contains: search, mode: "insensitive" } } },
      ]
      walletWhere.OR = [
        { paystackReference: { contains: search, mode: "insensitive" } },
        { accountNumber: { contains: search, mode: "insensitive" } },
        { accountName: { contains: search, mode: "insensitive" } },
      ]
    }

    const fetchTransfer = kind !== "wallet"
    const fetchWallet = kind !== "transfer"

    const [transferPayouts, walletWithdrawals] = await Promise.all([
      fetchTransfer
        ? prisma.moneyTransferPayout.findMany({
            where: transferWhere,
            include: {
              transfer: {
                include: {
                  sender: { select: { id: true, name: true, email: true, phone: true } },
                  receiver: { select: { id: true, name: true, email: true, phone: true } },
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 200,
          })
        : Promise.resolve([]),
      fetchWallet
        ? prisma.moneyWalletWithdrawal.findMany({
            where: walletWhere,
            include: {
              user: { select: { id: true, name: true, email: true, phone: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 200,
          })
        : Promise.resolve([]),
    ])

    const mapped = [
      ...transferPayouts.map((payout) => ({
        id: payout.id,
        kind: "TRANSFER_PAYOUT" as const,
        transfer: {
          id: payout.transfer.id,
          reference: payout.transfer.reference,
          sender: {
            id: payout.transfer.sender.id,
            name:
              payout.transfer.sender.name ||
              payout.transfer.sender.email ||
              payout.transfer.sender.phone,
          },
          receiver: {
            id: payout.transfer.receiver.id,
            name:
              payout.transfer.receiver.name ||
              payout.transfer.receiver.email ||
              payout.transfer.receiver.phone,
          },
        },
        user: null,
        amount: payout.amount / 100,
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
        scheduledProcessAt: null,
        createdAt: payout.createdAt,
        processedAt: payout.processedAt,
        completedAt: payout.completedAt,
        failedAt: payout.failedAt,
      })),
      ...walletWithdrawals.map((w) => ({
        id: w.id,
        kind: "WALLET_WITHDRAWAL" as const,
        transfer: null,
        user: {
          id: w.user.id,
          name: w.user.name || w.user.email || w.user.phone,
        },
        amount: w.amount,
        currency: w.currency,
        status:
          w.status === "COMPLETED"
            ? "SUCCESS"
            : w.status === "SCHEDULED"
              ? "PENDING"
              : w.status,
        bankName: w.bankName,
        accountNumber: w.accountNumber,
        accountName: w.accountName,
        bankCode: w.bankCode,
        paystackTransferCode: w.paystackTransferCode,
        paystackReference: w.paystackReference,
        failureReason: w.failureReason,
        retryCount: 0,
        scheduledProcessAt: w.scheduledProcessAt,
        createdAt: w.createdAt,
        processedAt: w.processedAt,
        completedAt: w.completedAt,
        failedAt: w.failedAt,
        rawStatus: w.status,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const total = mapped.length
    const pageItems = mapped.slice(offset, offset + limit)

    return NextResponse.json({
      success: true,
      payouts: pageItems,
      pagination: {
        total,
        limit,
        offset,
        page,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: offset + limit < total,
      },
    })
  } catch (error: unknown) {
    if (error instanceof MoneyAdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Error fetching payouts:", error)
    const message = error instanceof Error ? error.message : "Failed to fetch payouts"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
