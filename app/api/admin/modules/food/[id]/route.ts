import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const restaurant = await prisma.restaurant.findUnique({
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
        _count: { select: { menuItems: true, foodOrders: true } },
        foodOrders: {
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
        },
      },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    const revenue = await prisma.order.aggregate({
      where: { foodId: restaurant.id, status: "DELIVERED" },
      _sum: { total: true },
    })

    return NextResponse.json({
      restaurant,
      summary: {
        deliveredRevenue: revenue._sum.total ?? 0,
        recentOrders: restaurant.foodOrders,
      },
    })
  } catch (e) {
    console.error("Admin food detail GET:", e)
    return NextResponse.json({ error: "Failed to load restaurant" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireAdmin()
  if (error) return error

  try {
    const body = await request.json()
    const {
      name,
      description,
      address,
      phone,
      email,
      website,
      deliveryTime,
      deliveryFee,
      minOrderAmount,
      maxDeliveryDistance,
      isOpen,
      isVerified,
      user: userPatch,
    } = body || {}

    const existing = await prisma.restaurant.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (name !== undefined) data.name = String(name)
    if (description !== undefined) data.description = description
    if (address !== undefined) data.address = String(address)
    if (phone !== undefined) data.phone = String(phone)
    if (email !== undefined) data.email = email
    if (website !== undefined) data.website = website
    if (deliveryTime !== undefined) data.deliveryTime = String(deliveryTime)
    if (deliveryFee !== undefined) data.deliveryFee = Number(deliveryFee)
    if (minOrderAmount !== undefined) data.minOrderAmount = Number(minOrderAmount)
    if (maxDeliveryDistance !== undefined) data.maxDeliveryDistance = Number(maxDeliveryDistance)
    if (isOpen !== undefined) data.isOpen = Boolean(isOpen)
    if (isVerified !== undefined) data.isVerified = Boolean(isVerified)

    await prisma.restaurant.update({ where: { id: params.id }, data: data as any })

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
        action: "ADMIN_UPDATE_RESTAURANT",
        entityType: "Restaurant",
        entityId: params.id,
        details: { body },
      },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Admin food detail PATCH:", e)
    return NextResponse.json({ error: "Failed to update restaurant" }, { status: 500 })
  }
}
