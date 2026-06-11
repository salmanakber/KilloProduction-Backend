import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { parseAdminRange } from "@/lib/adminDateRange"
import type { Prisma } from "@prisma/client"
import type { WalletTransactionStatus, WalletTransactionType } from "@prisma/client"

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const type = searchParams.get("type")
    const page = Number.parseInt(searchParams.get("page") || "1", 10)
    const limit = Number.parseInt(searchParams.get("limit") || "20", 10)
    const startDateParam = searchParams.get("startDate")
    const endDateParam = searchParams.get("endDate")
    const range = searchParams.get("range")
    const q = (searchParams.get("q") || "").trim().toLowerCase()
    const moduleFilter = (searchParams.get("module") || "").trim().toUpperCase()

    const skip = (page - 1) * limit

    const parts: Prisma.WalletTransactionWhereInput[] = []
    if (status && status !== "ALL") {
      parts.push({ status: status as WalletTransactionStatus })
    }
    if (type && type !== "ALL") {
      parts.push({ type: type as WalletTransactionType })
    }
    if (startDateParam && endDateParam) {
      parts.push({
        createdAt: {
          gte: new Date(startDateParam),
          lte: new Date(endDateParam),
        },
      })
    } else if (range) {
      const { start, end } = parseAdminRange(range)
      parts.push({ createdAt: { gte: start, lte: end } })
    }
    if (q) {
      parts.push({
        OR: [
          { id: { contains: q, mode: "insensitive" } },
          { reference: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { orderId: { contains: q, mode: "insensitive" } },
          { user: { name: { contains: q, mode: "insensitive" } } },
          { user: { email: { contains: q, mode: "insensitive" } } },
        ],
      })
    }
    if (moduleFilter && moduleFilter !== "ALL") {
      parts.push({
        OR: [
          { metadata: { path: ["module"], equals: moduleFilter } },
          { description: { contains: moduleFilter === "PROPERTY" ? "property" : moduleFilter.toLowerCase(), mode: "insensitive" } },
        ],
      })
    }

    const where: Prisma.WalletTransactionWhereInput =
      parts.length === 0 ? {} : parts.length === 1 ? parts[0]! : { AND: parts }

    const [rows, totalCount] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      prisma.walletTransaction.count({ where }),
    ])

    const orderIds = Array.from(new Set(rows.map((r) => r.orderId).filter((id): id is string => Boolean(id))))
    const orders =
      orderIds.length > 0
        ? await prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: {
              id: true,
              orderNumber: true,
              vendor: { select: { id: true, name: true } },
            },
          })
        : []
    const orderMap = new Map(orders.map((o) => [o.id, o]))

    const metaCurrency = (meta: unknown): string | undefined => {
      if (meta && typeof meta === "object" && "currency" in meta) {
        const c = (meta as { currency?: unknown }).currency
        return typeof c === "string" ? c : undefined
      }
      return undefined
    }

    const payments = rows.map((tx) => {
      const ord = tx.orderId ? orderMap.get(tx.orderId) : undefined
      const md = tx.metadata as Record<string, unknown> | null
      return {
        id: tx.id,
        transactionId: tx.reference || tx.id,
        amount: tx.amount,
        currency: metaCurrency(tx.metadata) || "USD",
        status: tx.status,
        type: tx.type,
        method: "WALLET",
        userId: tx.user.id,
        userName: tx.user.name,
        userType: tx.user.role,
        vendorId: ord?.vendor?.id ?? null,
        vendorName: ord?.vendor?.name ?? null,
        orderId: tx.orderId,
        orderNumber: ord?.orderNumber ?? null,
        description: tx.description,
        createdAt: tx.createdAt.toISOString(),
        processedAt: tx.createdAt.toISOString(),
        fees: {
          platformFee: typeof md?.platformFee === "number" ? md.platformFee : 0,
          processingFee: typeof md?.processingFee === "number" ? md.processingFee : 0,
          total:
            (typeof md?.platformFee === "number" ? md.platformFee : 0) +
            (typeof md?.processingFee === "number" ? md.processingFee : 0),
        },
        failureReason: tx.status === "FAILED" && typeof md?.failureReason === "string" ? md.failureReason : undefined,
        balanceAfter: tx.balance,
      }
    })

    return NextResponse.json({
      payments,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    })
  } catch (e) {
    console.error("Error fetching wallet transactions (admin payments):", e)
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 })
  }
}
