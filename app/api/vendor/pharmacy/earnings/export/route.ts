import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get pharmacy ID
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: session.id },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: 'Pharmacy not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'CSV'
    const range = searchParams.get('range') || '30d'

    // Calculate date range
    const now = new Date()
    let startDate = new Date()

    switch (range) {
      case '7d':
        startDate.setDate(now.getDate() - 7)
        break
      case '30d':
        startDate.setDate(now.getDate() - 30)
        break
      case '90d':
        startDate.setDate(now.getDate() - 90)
        break
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1)
        break
      default:
        startDate.setDate(now.getDate() - 30)
    }

    // Get verified wallet transactions
    const walletTransactions = await prisma.walletTransaction.findMany({
      where: {
        userId: session.id,
        type: "CREDIT",
        status: "COMPLETED",
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Get order IDs to verify payments
    const orderIds = walletTransactions
      .map((wt) => wt.orderId)
      .filter((id): id is string => id !== null && id !== undefined)

    // Verify payments
    const payments =
      orderIds.length > 0
        ? await prisma.payment.findMany({
            where: {
              orderId: { in: orderIds },
              status: "PAID",
            },
            select: {
              orderId: true,
            },
          })
        : []
    const verifiedOrderIds = new Set(
      payments.map((p) => p.orderId).filter((id): id is string => id !== null)
    )

    // Verify orders belong to PHARMACY module
    const orders =
      orderIds.length > 0
        ? await prisma.order.findMany({
            where: {
              id: { in: orderIds },
              module: "PHARMACY",
              OR: [{ vendorId: session.id }, { vendorId: pharmacy.id }, { pharmacyId: pharmacy.id }],
            },
            select: {
              id: true,
              orderNumber: true,
              total: true,
              createdAt: true,
            },
          })
        : []
    const validOrderIds = new Set(orders.map((o) => o.id))

    // Filter verified transactions
    const verifiedTransactions = walletTransactions.filter((wt) => {
      if (!wt.orderId) {
        const metadata = wt.metadata as any
        return metadata && metadata.module === "PHARMACY"
      }
      return verifiedOrderIds.has(wt.orderId) && validOrderIds.has(wt.orderId)
    })

    // Get order details for CSV
    const orderMap = new Map(orders.map((o) => [o.id, o]))

    if (format.toUpperCase() === 'CSV') {
      // Generate CSV content
      const csvRows = [
        ['Date', 'Transaction ID', 'Order Number', 'Amount (NGN)', 'Description', 'Status'].join(','),
      ]

      verifiedTransactions.forEach((wt) => {
        const order = wt.orderId ? orderMap.get(wt.orderId) : null
        const date = new Date(wt.createdAt).toLocaleDateString()
        const transactionId = wt.id
        const orderNumber = order?.orderNumber || 'N/A'
        const amount = wt.amount.toFixed(2)
        const description = wt.description || 'Earnings'
        const status = wt.status

        csvRows.push([date, transactionId, orderNumber, amount, `"${description}"`, status].join(','))
      })

      const csvContent = csvRows.join('\n')

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="pharmacy-earnings-${range}-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      })
    } else {
      // JSON format (for other formats in future)
      return NextResponse.json({
        transactions: verifiedTransactions.map((wt) => ({
          id: wt.id,
          date: wt.createdAt,
          orderNumber: wt.orderId ? orderMap.get(wt.orderId)?.orderNumber : null,
          amount: wt.amount,
          description: wt.description,
          status: wt.status,
        })),
        summary: {
          totalEarnings: verifiedTransactions.reduce((sum, wt) => sum + wt.amount, 0),
          totalTransactions: verifiedTransactions.length,
          period: range,
          startDate: startDate.toISOString(),
          endDate: now.toISOString(),
        },
      })
    }
  } catch (error) {
    console.error('Error exporting earnings:', error)
    return NextResponse.json({ error: 'Failed to export earnings' }, { status: 500 })
  }
}
