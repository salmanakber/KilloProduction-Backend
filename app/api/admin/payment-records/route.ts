import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"
import { parseAdminRange } from "@/lib/adminDateRange"
import { PaymentStatus, type Prisma } from "@prisma/client"

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1", 10)
    const limit = Number.parseInt(searchParams.get("limit") || "20", 10)
    const q = (searchParams.get("q") || "").trim()
    const range = searchParams.get("range")
    const startDateParam = searchParams.get("startDate")
    const endDateParam = searchParams.get("endDate")

    const skip = (page - 1) * limit

    const parts: Prisma.PaymentWhereInput[] = []
    if (status && status !== "ALL") {
      if (!Object.values(PaymentStatus).includes(status as PaymentStatus)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 })
      }
      parts.push({ status: status as PaymentStatus })
    }

    if (startDateParam && endDateParam) {
      parts.push({
        createdAt: { gte: new Date(startDateParam), lte: new Date(endDateParam) },
      })
    } else if (range) {
      const { start, end } = parseAdminRange(range)
      parts.push({ createdAt: { gte: start, lte: end } })
    }

    if (q) {
      parts.push({
        OR: [
          { id: { contains: q, mode: "insensitive" } },
          { orderId: { contains: q, mode: "insensitive" } },
          { gatewayTransactionId: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { user: { email: { contains: q, mode: "insensitive" } } },
          { user: { name: { contains: q, mode: "insensitive" } } },
        ],
      })
    }

    const where: Prisma.PaymentWhereInput =
      parts.length === 0 ? {} : parts.length === 1 ? parts[0]! : { AND: parts }

    const [rows, totalCount] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
          paymentMethod: {
            select: { id: true, type: true, provider: true, brand: true, lastFour: true, last4: true },
          },
          processingFeeLedger: {
            select: {
              id: true,
              orderAmount: true,
              commissionRate: true,
              commissionAmount: true,
              currency: true,
              gateway: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.payment.count({ where }),
    ])

    const orderIds = Array.from(
      new Set(rows.map((r) => r.orderId).filter((id): id is string => Boolean(id))),
    )
    const orders =
      orderIds.length > 0
        ? await prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: {
              id: true,
              orderNumber: true,
              subtotal: true,
              deliveryFee: true,
              serviceFee: true,
              tax: true,
              discount: true,
              total: true,
              vendor: { select: { id: true, name: true } },
            },
          })
        : []
    const orderMap = new Map(orders.map((o) => [o.id, o]))

    const payments = rows.map((p) => {
      const ord = p.orderId ? orderMap.get(p.orderId) : undefined
      return {
        id: p.id,
        userId: p.userId,
        userName: p.user.name,
        userEmail: p.user.email,
        userRole: p.user.role,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        gateway: p.gateway,
        gatewayTransactionId: p.gatewayTransactionId,
        paymentMethodId: p.paymentMethodId,
        orderId: p.orderId,
        orderNumber: ord?.orderNumber ?? null,
        orderSummary: ord
          ? {
              subtotal: ord.subtotal,
              deliveryFee: ord.deliveryFee,
              serviceFee: ord.serviceFee,
              tax: ord.tax,
              discount: ord.discount,
              total: ord.total,
            }
          : null,
        vendorName: ord?.vendor?.name ?? null,
        description: p.description,
        metadata: p.metadata,
        paymentGroupId:
          p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata)
            ? ((p.metadata as Record<string, unknown>).paymentGroupId as string | undefined) ?? null
            : null,
        paymentType:
          p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata)
            ? ((p.metadata as Record<string, unknown>).paymentType as string | undefined) ?? null
            : null,
        processingFeeLedger: p.processingFeeLedger
          ? {
              id: p.processingFeeLedger.id,
              orderAmount: p.processingFeeLedger.orderAmount,
              commissionRate: p.processingFeeLedger.commissionRate,
              commissionAmount: p.processingFeeLedger.commissionAmount,
              currency: p.processingFeeLedger.currency,
              gateway: p.processingFeeLedger.gateway,
              createdAt: p.processingFeeLedger.createdAt.toISOString(),
            }
          : null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        paymentMethod: p.paymentMethod
          ? {
              type: p.paymentMethod.type,
              provider: p.paymentMethod.provider,
              brand: p.paymentMethod.brand,
              lastFour: p.paymentMethod.lastFour || p.paymentMethod.last4,
            }
          : null,
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
    console.error("Admin payment-records GET:", e)
    return NextResponse.json({ error: "Failed to load payment records" }, { status: 500 })
  }
}
