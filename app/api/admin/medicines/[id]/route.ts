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
    const { medicineOriginIds, isActive, ...updateData } = data

    const medicine = await prisma.$transaction(async (tx) => {
      const updated = await tx.centralMedicine.update({
        where: { id: params.id },
        data: updateData,
      })

      if (Array.isArray(medicineOriginIds)) {
        await tx.centralMedicineOrigin.deleteMany({ where: { centralMedicineId: params.id } })
        if (medicineOriginIds.length > 0) {
          await tx.centralMedicineOrigin.createMany({
            data: Array.from(new Set(medicineOriginIds.filter(Boolean))).map((oid: string) => ({
              centralMedicineId: params.id,
              medicineOriginId: oid,
            })),
            skipDuplicates: true,
          })
        }
      }

      return updated
    })

    return NextResponse.json({ medicine })
  } catch (error) {
    console.error("Error updating medicine:", error)
    return NextResponse.json({ error: "Failed to update medicine" }, { status: 500 })
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

    await prisma.centralMedicine.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ message: "Medicine deleted successfully" })
  } catch (error) {
    console.error("Error deleting medicine:", error)
    return NextResponse.json({ error: "Failed to delete medicine" }, { status: 500 })
  }
} 