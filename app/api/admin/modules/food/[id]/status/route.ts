import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"

const ALLOWED = new Set(["APPROVED", "PENDING", "REJECTED", "SUSPENDED"])

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireAdmin()
  if (error) return error

  try {
    const { status } = await request.json()
    if (!ALLOWED.has(String(status))) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { id: params.id } })
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    const restaurantData: Record<string, unknown> = {}
    const userData: Record<string, unknown> = {}

    switch (status) {
      case "APPROVED":
        restaurantData.isVerified = true
        restaurantData.isOpen = true
        userData.isActive = true
        userData.isVerified = true
        userData.status = "ACTIVE"
        break
      case "PENDING":
        restaurantData.isVerified = false
        restaurantData.isOpen = true
        break
      case "REJECTED":
        restaurantData.isVerified = false
        break
      case "SUSPENDED":
        restaurantData.isOpen = false
        userData.isActive = false
        userData.status = "SUSPENDED"
        break
    }

    await prisma.$transaction([
      prisma.restaurant.update({ where: { id: params.id }, data: restaurantData as any }),
      prisma.user.update({ where: { id: restaurant.userId }, data: userData as any }),
    ])

    await prisma.auditLog.create({
      data: {
        performedBy: session!.id,
        action: "ADMIN_FOOD_STATUS",
        entityType: "Restaurant",
        entityId: params.id,
        details: { status },
      },
    })

    return NextResponse.json({ success: true, status })
  } catch (e) {
    console.error("Admin food status PATCH:", e)
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 })
  }
}
