import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateFromCookie } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateFromCookie()
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const medicineOrigin = await prisma.medicineOrigin.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            centralMedicines: true,
            pharmacySpecializations: true
          }
        }
      }
    })

    if (!medicineOrigin) {
      return NextResponse.json({ error: "Medicine origin not found" }, { status: 404 })
    }

    return NextResponse.json({ medicineOrigin })
  } catch (error) {
    console.error("Get medicine origin error:", error)
    return NextResponse.json({ 
      error: "Failed to fetch medicine origin" 
    }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateFromCookie()
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { name, displayName, description } = await request.json()

    if (!name || !displayName) {
      return NextResponse.json({ 
        error: "Name and display name are required" 
      }, { status: 400 })
    }

    // Check if name already exists (excluding current record)
    const existing = await prisma.medicineOrigin.findFirst({
      where: { 
        name: name.toUpperCase(),
        id: { not: params.id }
      }
    })

    if (existing) {
      return NextResponse.json({ 
        error: "Medicine origin with this name already exists" 
      }, { status: 400 })
    }

    const medicineOrigin = await prisma.medicineOrigin.update({
      where: { id: params.id },
      data: {
        name: name.toUpperCase(),
        displayName,
        description
      }
    })

    return NextResponse.json({
      success: true,
      medicineOrigin,
      message: "Medicine origin updated successfully"
    })
  } catch (error) {
    console.error("Update medicine origin error:", error)
    return NextResponse.json({ 
      error: "Failed to update medicine origin" 
    }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateFromCookie()
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { isActive } = await request.json()

    const medicineOrigin = await prisma.medicineOrigin.update({
      where: { id: params.id },
      data: { isActive }
    })

    return NextResponse.json({
      success: true,
      medicineOrigin,
      message: `Medicine origin ${isActive ? "activated" : "deactivated"} successfully`
    })
  } catch (error) {
    console.error("Toggle medicine origin status error:", error)
    return NextResponse.json({ 
      error: "Failed to update medicine origin status" 
    }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateFromCookie()
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if medicine origin is being used
    const usage = await prisma.medicineOrigin.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            centralMedicines: true,
            pharmacySpecializations: true
          }
        }
      }
    })

    if (!usage) {
      return NextResponse.json({ error: "Medicine origin not found" }, { status: 404 })
    }

    if (usage._count.centralMedicines > 0 || usage._count.pharmacySpecializations > 0) {
      return NextResponse.json({ 
        error: "Cannot delete medicine origin that is being used by medicines or pharmacies" 
      }, { status: 400 })
    }

    await prisma.medicineOrigin.delete({
      where: { id: params.id }
    })

    return NextResponse.json({
      success: true,
      message: "Medicine origin deleted successfully"
    })
  } catch (error) {
    console.error("Delete medicine origin error:", error)
    return NextResponse.json({ 
      error: "Failed to delete medicine origin" 
    }, { status: 500 })
  }
}
