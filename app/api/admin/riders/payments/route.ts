import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const riderId = searchParams.get("riderId")
    const paymentType = searchParams.get("paymentType")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}
    if (riderId) {
      where.riderId = riderId
    }
    if (paymentType && paymentType !== "ALL") {
      where.paymentType = paymentType
    }

    const [payments, totalCount] = await Promise.all([
      prisma.riderEarning.findMany({
        where,
        skip,
        take: limit,
        include: {
          rider: {
            select: {
              name: true,
              phone: true,
              email: true,
            },
          },
          order: {
            select: {
              orderNumber: true,
              total: true,
              paymentMethod: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.riderEarning.count({ where }),
    ])

    const formattedPayments = payments.map((payment) => ({
      id: payment.id,
      riderId: payment.riderId,
      riderName: payment.rider.name,
      riderPhone: payment.rider.phone,
      orderId: payment.orderId,
      orderNumber: payment.order?.orderNumber,
      orderTotal: payment.order?.total,
      deliveryFee: payment.deliveryFee,
      tip: payment.tip,
      bonus: payment.bonus,
      deductions: payment.deductions,
      netAmount: payment.netAmount,
      paymentType: payment.paymentType,
      paymentMethod: payment.order?.paymentMethod,
      status: payment.status,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      cashCollected: payment.cashCollected,
      cashDeposited: payment.cashDeposited,
      notes: payment.notes,
    }))

    return NextResponse.json({
      payments: formattedPayments,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching rider payments:", error)
    return NextResponse.json({ error: "Failed to fetch rider payments" }, { status: 500 })
  }
}
