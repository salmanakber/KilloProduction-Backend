import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const store = await prisma.autoPartsStore.findUnique({
      where: { id: params.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isVerified: true,
            isActive: true,
            status: true,
            createdAt: true,
            vendorProfile: true,
          },
        },
        _count: { select: { autoParts: true } },
      },
    })

    if (!store) {
      return NextResponse.json({ error: "Auto parts store not found" }, { status: 404 })
    }

    const orders = await prisma.order.findMany({
      where: {
        vendorId: store.userId,
        module: "AUTO_PARTS",
      },
      take: 15,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        createdAt: true,
        customer: { select: { id: true, name: true } },
      },
    })

    const revenue = await prisma.order.aggregate({
      where: { vendorId: store.userId, module: "AUTO_PARTS", status: "DELIVERED" },
      _sum: { total: true },
    })

    return NextResponse.json({
      store,
      summary: {
        deliveredRevenue: revenue._sum.total ?? 0,
        recentOrders: orders,
      },
    })
  } catch (e) {
    console.error("Admin auto-parts detail GET:", e)
    return NextResponse.json({ error: "Failed to load store" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireAdmin()
  if (error) return error

  try {
    const body = await request.json()
    const {
      storeName,
      description,
      address,
      phone,
      email,
      website,
      isVerified,
      isActive: storeIsActive,
      taxId,
      user: userPatch,
    } = body || {}

    const existing = await prisma.autoPartsStore.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: "Auto parts store not found" }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (storeName !== undefined) data.storeName = String(storeName)
    if (description !== undefined) data.description = description
    if (address !== undefined) data.address = String(address)
    if (phone !== undefined) data.phone = String(phone)
    if (email !== undefined) data.email = email
    if (website !== undefined) data.website = website
    if (isVerified !== undefined) data.isVerified = Boolean(isVerified)
    if (storeIsActive !== undefined) data.isActive = Boolean(storeIsActive)
    if (taxId !== undefined) data.taxId = taxId

    await prisma.autoPartsStore.update({ where: { id: params.id }, data: data as any })

    if (userPatch && typeof userPatch === "object") {
      const u: Record<string, unknown> = {}
      if (userPatch.name !== undefined) u.name = userPatch.name
      if (userPatch.email !== undefined) u.email = userPatch.email
      if (userPatch.phone !== undefined) u.phone = userPatch.phone
      if (userPatch.isActive !== undefined) u.isActive = Boolean(userPatch.isActive)
      if (Object.keys(u).length > 0) {
        await prisma.user.update({ where: { id: existing.userId }, data: u as any })
      }
    }

    await prisma.auditLog.create({
      data: {
        performedBy: session!.id,
        action: "ADMIN_UPDATE_AUTO_PARTS",
        entityType: "AutoPartsStore",
        entityId: params.id,
        details: { body },
      },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Admin auto-parts detail PATCH:", e)
    return NextResponse.json({ error: "Failed to update store" }, { status: 500 })
  }
}
