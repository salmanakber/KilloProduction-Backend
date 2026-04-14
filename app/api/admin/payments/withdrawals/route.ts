import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { parseAdminRange } from "@/lib/adminDateRange"

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const range = searchParams.get("range")
    const page = Number.parseInt(searchParams.get("page") || "1", 10)
    const limit = Number.parseInt(searchParams.get("limit") || "20", 10)

    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (status && status !== "ALL") {
      where.status = status
    }
    if (range) {
      const { start, end } = parseAdminRange(range)
      where.requestDate = { gte: start, lte: end }
    }

    // Get withdrawal requests from database
    const [withdrawals, totalCount] = await Promise.all([
      prisma.vendorWithdrawal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          bankAccount: {
            select: {
              accountName: true,
              accountNumber: true,
              bankName: true,
              routingNumber: true,
            },
          },
        },
      }),
      prisma.vendorWithdrawal.count({ where }),
    ])

    // Format withdrawals for frontend
    const formattedWithdrawals = withdrawals.map((withdrawal) => ({
      id: withdrawal.id,
      vendorId: withdrawal.vendor.id,
      vendorName: withdrawal.vendor.name,
      vendorEmail: withdrawal.vendor.email,
      vendorPhone: withdrawal.vendor.phone,
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      bankDetails: withdrawal.bankAccount
        ? {
            accountName: withdrawal.bankAccount.accountName,
            accountNumber: withdrawal.bankAccount.accountNumber,
            bankName: withdrawal.bankAccount.bankName,
            routingNumber: withdrawal.bankAccount.routingNumber,
          }
        : null,
      status: withdrawal.status,
      requestedAt: withdrawal.requestDate.toISOString(),
      processedAt: withdrawal.processedDate?.toISOString() ?? withdrawal.completedDate?.toISOString() ?? null,
      processedBy: withdrawal.processedBy ?? null,
      rejectionReason: withdrawal.rejectionReason,
      notes: withdrawal.notes,
    }))

    return NextResponse.json({
      withdrawals: formattedWithdrawals,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching withdrawals:", error)
    return NextResponse.json({ error: "Failed to fetch withdrawals" }, { status: 500 })
  }
}
