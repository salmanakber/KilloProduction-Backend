import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Module, OrderStatus, PaymentStatus, SupplierOrderStatus } from "@prisma/client"

export async function GET(request: NextRequest) {
  try {
    const actor = await authenticateRequest(request)
    if (!actor?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const type = (searchParams.get("type") || "ALL").toUpperCase()
    const module = (searchParams.get("module") || "ALL").toUpperCase()
    const status = (searchParams.get("status") || "ALL").toUpperCase()
    const paymentStatus = (searchParams.get("paymentStatus") || "ALL").toUpperCase()
    const search = (searchParams.get("search") || "").trim()
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const createdAt =
      startDate && endDate
        ? { gte: new Date(startDate), lte: new Date(endDate) }
        : undefined

    const orderWhere: any = {
      ...(createdAt ? { createdAt } : {}),
      ...(module !== "ALL" && module in Module ? { module: module as Module } : {}),
      ...(status !== "ALL" && status in OrderStatus ? { status: status as OrderStatus } : {}),
      ...(paymentStatus !== "ALL" && paymentStatus in PaymentStatus ? { paymentStatus: paymentStatus as PaymentStatus } : {}),
      ...(search
        ? {
            OR: [
              { id: { contains: search, mode: "insensitive" } },
              { orderNumber: { contains: search, mode: "insensitive" } },
              { customer: { name: { contains: search, mode: "insensitive" } } },
              { vendor: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    }

    const supplierWhere: any = {
      ...(createdAt ? { createdAt } : {}),
      ...(status !== "ALL" && status in SupplierOrderStatus ? { status: status as SupplierOrderStatus } : {}),
      ...(paymentStatus !== "ALL" && paymentStatus in PaymentStatus ? { paymentStatus: paymentStatus as PaymentStatus } : {}),
      ...(search
        ? {
            OR: [
              { id: { contains: search, mode: "insensitive" } },
              { orderNumber: { contains: search, mode: "insensitive" } },
              { pharmacy: { pharmacyName: { contains: search, mode: "insensitive" } } },
              { wholesaler: { companyName: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    }

    const [orders, supplierOrders] = await Promise.all([
      type === "SUPPLIER"
        ? Promise.resolve([])
        : prisma.order.findMany({
            where: orderWhere,
            orderBy: { createdAt: "desc" },
            take: 300,
            include: {
              customer: { select: { id: true, name: true, email: true } },
              vendor: { select: { id: true, name: true, email: true } },
              rider: { select: { id: true, name: true, email: true } },
            },
          }),
      type === "MARKETPLACE"
        ? Promise.resolve([])
        : prisma.supplierOrder.findMany({
            where: supplierWhere,
            orderBy: { createdAt: "desc" },
            take: 300,
            include: {
              pharmacy: { select: { id: true, pharmacyName: true } },
              wholesaler: { select: { id: true, companyName: true } },
            },
          }),
    ])

    const marketplaceRows = orders.map((o) => ({
      entityType: "MARKETPLACE",
      id: o.id,
      orderNumber: o.orderNumber,
      module: o.module,
      status: o.status,
      paymentStatus: o.paymentStatus,
      subtotal: o.subtotal,
      deliveryFee: o.deliveryFee,
      serviceFee: o.serviceFee,
      tax: o.tax,
      discount: o.discount,
      total: o.total,
      createdAt: o.createdAt,
      customerName: o.customer?.name || "N/A",
      vendorName: o.vendor?.name || "N/A",
      riderName: o.rider?.name || "N/A",
    }))
    const supplierRows = supplierOrders.map((s) => ({
      entityType: "SUPPLIER",
      id: s.id,
      orderNumber: s.orderNumber,
      module: "WHOLESALER",
      status: s.status,
      paymentStatus: s.paymentStatus,
      subtotal: s.totalAmount,
      deliveryFee: 0,
      serviceFee: 0,
      tax: 0,
      discount: 0,
      total: s.totalAmount,
      createdAt: s.createdAt,
      customerName: s.pharmacy?.pharmacyName || "N/A",
      vendorName: s.wholesaler?.companyName || "N/A",
      riderName: "N/A",
    }))

    const rows = [...marketplaceRows, ...supplierRows].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

    return NextResponse.json({ orders: rows })
  } catch (error) {
    console.error("admin orders list:", error)
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 })
  }
}
