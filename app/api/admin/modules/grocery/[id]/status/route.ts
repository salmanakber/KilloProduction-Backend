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

    const store = await prisma.groceryStore.findUnique({ where: { id: params.id } })
    if (!store) {
      return NextResponse.json({ error: "Grocery store not found" }, { status: 404 })
    }

    const storeData: Record<string, unknown> = {}
    const userData: Record<string, unknown> = {}

    switch (status) {
      case "APPROVED":
        storeData.isVerified = true
        storeData.isOpen = true
        userData.isActive = true
        userData.isVerified = true
        userData.status = "ACTIVE"
        break
      case "PENDING":
        storeData.isVerified = false
        storeData.isOpen = true
        break
      case "REJECTED":
        storeData.isVerified = false
        break
      case "SUSPENDED":
        storeData.isOpen = false
        userData.isActive = false
        userData.status = "SUSPENDED"
        break
    }

    await prisma.$transaction([
      prisma.groceryStore.update({ where: { id: params.id }, data: storeData as any }),
      prisma.user.update({ where: { id: store.userId }, data: userData as any }),
    ])

    await prisma.auditLog.create({
      data: {
        performedBy: session!.id,
        action: "ADMIN_GROCERY_STATUS",
        entityType: "GroceryStore",
        entityId: params.id,
        details: { status },
      },
    })

    return NextResponse.json({ success: true, status })
  } catch (e) {
    console.error("Admin grocery status PATCH:", e)
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 })
  }
}
