import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const data = await request.json()
    const { isActive, ...updateData } = data

    const illnessCategory = await prisma.illnessCategory.update({
      where: { id: params.id },
      data: updateData,
    })

    return NextResponse.json({ illnessCategory })
  } catch (error) {
    console.error("Error updating illness category:", error)
    return NextResponse.json({ error: "Failed to update illness category" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    await prisma.illnessCategory.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ message: "Illness category deleted successfully" })
  } catch (error) {
    console.error("Error deleting illness category:", error)
    return NextResponse.json({ error: "Failed to delete illness category" }, { status: 500 })
  }
} 